package fr.nseguy.boussole;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Le widget posé sur l'écran d'accueil : deux lignes qui répondent à « où en est le marché,
 * où en est mon portefeuille » sans ouvrir l'application. Redessine à l'écriture de l'état
 * et sur le rafraîchissement périodique du système (30 min au plus).
 */
public class BoussoleWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] appWidgetIds) {
        renderAll(ctx, manager, appWidgetIds);
    }

    static void renderAll(Context ctx, AppWidgetManager manager, int[] ids) {
        String raw = BoussoleWidget.readState(ctx);
        String temperature = "—";
        String value = "Ouvre Boussole pour la première fois";
        if (raw != null) {
            try {
                JSONObject state = new JSONObject(raw);
                Object t = state.opt("temperature");
                String zone = state.optString("zone", "");
                if (t != null && !JSONObject.NULL.equals(t)) {
                    temperature = Math.round(Double.parseDouble(String.valueOf(t))) + "/100"
                            + (zone.isEmpty() ? "" : " · " + zone);
                }
                Object v = state.opt("value");
                if (v != null && !JSONObject.NULL.equals(v)) {
                    String currency = state.optString("currency", "EUR");
                    String symbol = "EUR".equals(currency) ? "€" : "$";
                    value = String.format(java.util.Locale.FRANCE, "%,.0f %s · %s", Double.parseDouble(String.valueOf(v)), symbol, state.optString("updatedAt", ""));
                }
            } catch (JSONException | NumberFormatException ignored) {
                // Un état illisible n'affiche jamais un chiffre inventé : le message de repli reste.
            }
        }
        for (int id : ids) {
            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_boussole);
            views.setTextViewText(R.id.widget_market, temperature);
            views.setTextViewText(R.id.widget_value, value);
            manager.updateAppWidget(id, views);
        }
    }
}
