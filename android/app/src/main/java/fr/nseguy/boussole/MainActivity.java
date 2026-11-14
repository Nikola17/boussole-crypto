package fr.nseguy.boussole;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Les plugins maison de Boussole : widget d'écran d'accueil, coffre matériel des secrets, verrou biométrique.
        registerPlugin(BoussoleWidget.class);
        registerPlugin(BoussoleKeychain.class);
        registerPlugin(BoussoleLock.class);
    }
}
