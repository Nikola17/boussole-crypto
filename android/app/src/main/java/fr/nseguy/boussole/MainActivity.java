package fr.nseguy.boussole;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Les plugins maison de Boussole : widget d'écran d'accueil et coffre matériel des secrets.
        registerPlugin(BoussoleWidget.class);
        registerPlugin(BoussoleKeychain.class);
    }
}
