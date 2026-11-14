package fr.nseguy.boussole;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Coffre matériel des secrets Android : les clés API et phrases de passe de Boussole sont
 * chiffrées par une clé AES qui ne quitte jamais le keystore Android — le stockage de
 * l'application n'en contient jamais en clair, comme le fait Windows avec safeStorage.
 */
@CapacitorPlugin(name = "BoussoleKeychain")
public class BoussoleKeychain extends Plugin {

    private static final String KS_ALIAS = "boussole-secrets";
    private static final int GCM_TAG_BITS = 128;

    /** La clé AES-256 du keystore, créée au premier usage. */
    private SecretKey key(Context ctx) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        SecretKey key = (SecretKey) ks.getKey(KS_ALIAS, null);
        if (key != null) return key;
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KS_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return kg.generateKey();
    }

    /** value → blob « iv:chiffré » (base64) : seul le keystore sait le rouvrir. */
    @PluginMethod
    public void sealSecret(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty()) {
            call.reject("Rien à sceller.");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(getContext()));
            byte[] iv = cipher.getIV();
            byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String blob = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            JSObject out = new JSObject();
            out.put("blob", blob);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Keystore indisponible : " + e.getMessage());
        }
    }

    /** blob « iv:chiffré » → value. Un blob qui ne correspond pas (app réinstallée) est refusé, jamais deviné. */
    @PluginMethod
    public void openSecret(PluginCall call) {
        String blob = call.getString("blob");
        if (blob == null || !blob.contains(":")) {
            call.reject("Blob illisible.");
            return;
        }
        try {
            String[] parts = blob.split(":", 2);
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ct = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(getContext()), new GCMParameterSpec(GCM_TAG_BITS, iv));
            String value = new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
            JSObject out = new JSObject();
            out.put("value", value);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Indéchiffrable sur cet appareil (keystore changé ?)");
        }
    }
}
