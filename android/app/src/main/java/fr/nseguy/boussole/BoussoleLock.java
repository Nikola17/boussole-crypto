package fr.nseguy.boussole;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Context;

/**
 * Verrou de l'application : empreinte, visage ou code de l'appareil (AndroidX BiometricPrompt,
 * avec repli sur le code PIN/schema du téléphone). L'appel reste ouvert jusqu'au verdict —
 * l'utilisateur peut réessayer tant qu'il n'a pas réussi ni annulé.
 */
@CapacitorPlugin(name = "BoussoleLock")
public class BoussoleLock extends Plugin {

    /** Y a-t-il un verrou biométrique OU un code d'appareil utilisable sur ce téléphone ? */
    @PluginMethod
    public void available(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        int can = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK
                | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        JSObject out = new JSObject();
        // BIOMETRIC_SUCCESS(0) OU DEVICE_CREDENTIAL... : 0 suffit ; les autres codes (aucun matos
        // enrollé, verrou écran absent, trop de tentatives, matériel indisponible) refusent proprement.
        out.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
        out.put("code", can);
        call.resolve(out);
    }

    /** Demande le déverrouillage : rend { ok: true } en cas de succès, { ok: false, reason } sinon. */
    @PluginMethod
    public void authenticate(PluginCall call) {
        Context ctx = getContext();
        BiometricManager bm = BiometricManager.from(ctx);
        int can = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK
                | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            JSObject no = new JSObject();
            no.put("ok", false);
            no.put("reason", "aucun verrou configuré sur ce téléphone");
            call.resolve(no);
            return;
        }
        BiometricPrompt.PromptInfo prompt = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Boussole est verrouillée")
                .setSubtitle("Prouve que c'est toi pour ouvrir ton tableau de bord.")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK
                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                .build();
        // La boîte de dialogue système tient sur l'activité courante : le contenu de l'app reste masqué derrière.
        BiometricPrompt bp = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(ctx), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(int cameraId, BiometricPrompt.CryptoObject result) {
                JSObject out = new JSObject();
                out.put("ok", true);
                call.resolve(out);
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                JSObject out = new JSObject();
                out.put("ok", false);
                out.put("reason", errString != null ? errString.toString() : "annulé");
                call.resolve(out);
            }
        });
        bp.authenticate(prompt);
    }
}
