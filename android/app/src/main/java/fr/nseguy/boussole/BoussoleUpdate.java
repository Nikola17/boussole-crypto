package fr.nseguy.boussole;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Mise à jour depuis l'application : télécharge l'APK officiel depuis les releases publiques du dépôt
 * (les redirections GitHub sont suivies par HttpURLConnection), puis ouvre l'installeur système.
 * Seule l'URL du dépôt Boussole est acceptée ; un APK incomplet n'est jamais proposé à l'installation.
 */
@CapacitorPlugin(name = "BoussoleUpdate")
public class BoussoleUpdate extends Plugin {

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.startsWith("https://github.com/Nikola17/boussole-crypto/releases/")) {
            JSObject refused = new JSObject();
            refused.put("ok", false);
            refused.put("reason", "source inattendue");
            call.resolve(refused);
            return;
        }
        final Context ctx = getContext();
        getBridge().execute(() -> {
            File apk = null;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) throw new Exception("téléchargement refusé (HTTP " + status + ")");
                apk = new File(ctx.getCacheDir(), "boussole-update.apk");
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    long received = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        received += n;
                    }
                    if (received < 1000000) throw new Exception("APK incomplet (" + received + " octets)");
                    // Pas de barre de progression temps réel (total est parfois inconnu) : l'APK est petit.
                }
                conn.disconnect();

                // L'installeur système exige que l'utilisateur ait autorisé Boussole à installer des mises à jour.
                if (!ctx.getPackageManager().canRequestPackageInstalls()) {
                    Intent allow = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + ctx.getPackageName()));
                    allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(allow);
                    JSObject ask = new JSObject();
                    ask.put("ok", false);
                    ask.put("reason", "autorise Boussole à installer des applications dans l'écran qui vient de s'ouvrir, puis relance la mise à jour");
                    call.resolve(ask);
                    return;
                }

                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk),
                        "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(install);
                JSObject ok = new JSObject();
                ok.put("ok", true);
                call.resolve(ok);
            } catch (Exception e) {
                JSObject ko = new JSObject();
                ko.put("ok", false);
                ko.put("reason", e.getMessage() != null ? e.getMessage() : "échec du téléchargement");
                call.resolve(ko);
            }
        });
    }
}
