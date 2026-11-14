package fr.nseguy.boussole;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * Le widget d'écran d'accueil Android : température du marché et valeur du portefeuille,
 * rafraîchis par l'application à chaque relevé. L'application écrit l'état dans ses
 * préférences privées puis demande au système de redessiner les widgets installés.
 */
@CapacitorPlugin(name = "BoussoleWidget")
public class BoussoleWidget extends Plugin {

    static final String PREFS = "boussole_widget";
    static final String KEY_STATE = "state";

    /** État du widget : température (0-100 ou null), libellé de zone, valeur, devise, date. */
    static String readState(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getString(KEY_STATE, null);
    }

    static void writeState(Context ctx, String json) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_STATE, json).apply();
    }

    /** Redessine tous les widgets Boussole installés (appelé après chaque écriture). */
    static void refresh(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, BoussoleWidgetProvider.class));
        if (ids != null && ids.length > 0) {
            BoussoleWidgetProvider.renderAll(ctx, manager, ids);
        }
    }

    @PluginMethod
    public void updateState(PluginCall call) {
        try {
            JSObject state = new JSObject();
            Double temperature = call.getDouble("temperature");
            Double value = call.getDouble("value");
            state.put("temperature", temperature == null ? JSONObject.NULL : temperature);
            state.put("zone", call.getString("zone"));
            state.put("value", value == null ? JSONObject.NULL : value);
            state.put("currency", call.getString("currency"));
            state.put("updatedAt", call.getString("updatedAt"));
            writeState(getContext(), state.toString());
            refresh(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Widget indisponible : " + e.getMessage());
        }
    }
}
