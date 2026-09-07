package com.respira.movil;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * rESPira · MOVIL v10
 *
 * CAMBIO DE FONDO respecto a las versiones anteriores: la interfaz ya NO la
 * sirve el ESP32. Vive aquí dentro, en assets/app/, y carga al instante. El
 * sensor se dedica solo a medir y a mandar muestras por WebSocket.
 *
 * Por qué: servir paginas, CSS y JavaScript mientras se muestrea a 100 Hz era
 * justo lo que ahogaba al ESP32 — paginas a medio cargar, latencias de
 * segundos y cortes. Ahora ese trabajo lo hace el telefono, que va sobrado.
 *
 * Lo que aporta la parte nativa, y que una pagina no puede hacer sola:
 *   1. ENCONTRAR EL SENSOR. mDNS, la ultima IP conocida y un barrido de la
 *      subred. Desde JavaScript no hay forma.
 *   2. ESCRIBIR CSV EN Descargas/, a chorros. El WebView ignora en silencio
 *      las descargas tipo blob, y una noche entera no cabe en un string.
 *   3. MANTENER LA PANTALLA ENCENDIDA durante una sesion.
 *   4. Conectarse al AP del sensor cuando este en modo portal.
 */
public class MainActivity extends Activity {

    private static final String INICIO = "file:///android_asset/app/index.html";
    private static final String AP_URL = "http://192.168.4.1";
    private static final String SSID   = "Respira-ESP32";
    // Clave del punto de acceso que levanta el sensor cuando no encuentra
    // ninguna red conocida. TIENE QUE COINCIDIR con AP_PASS de firmware/redes.h.
    // No es un secreto de servidor: protege una red local efimera y cualquiera
    // con el APK puede extraerla. Aun asi, cambiala junto con la del firmware.
    private static final String PASS   = "respira1234";
    private static final String MDNS_NOMBRE = "respira";

    private WebView web;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback cb;
    private android.content.SharedPreferences prefs;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final AtomicBoolean buscando = new AtomicBoolean(false);
    private String ipSensor = null;
    private boolean paginaLista = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        cm    = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        prefs = getSharedPreferences("respira", MODE_PRIVATE);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // La app se carga desde sus propios ficheros (file://) y tiene que
        // hablar con el sensor, que esta en otra direccion. Sin esto el
        // WebView bloquearia esas peticiones por politica de origen cruzado.
        // Es seguro aqui porque lo unico que se carga es codigo propio.
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        web.setBackgroundColor(0xFF070B0F);
        web.addJavascriptInterface(new Puente(), "RespiraAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                paginaLista = true;
                if (ipSensor != null) avisaSensor(ipSensor);
                else buscarSensor();
            }
        });

        setContentView(web);
        pantallaCompleta();
        web.loadUrl(INICIO);          // instantaneo: no depende del sensor
    }

    private void pantallaCompleta() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
              | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
              | View.SYSTEM_UI_FLAG_FULLSCREEN
              | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void js(final String codigo) {
        ui.post(new Runnable() { @Override public void run() {
            if (web != null) web.evaluateJavascript(codigo, null);
        }});
    }
    private void avisaSensor(String ip) {
        ipSensor = ip;
        prefs.edit().putString("ip", ip).apply();
        js("window.rESPira && window.rESPira.sensor('" + ip + "')");
    }

    // ====================================================== buscar el sensor ==
    /**
     * Tres vias, de la mas rapida a la mas lenta: la ultima IP que funciono,
     * mDNS (el firmware se anuncia como 'respira'), y un barrido de la subred
     * por si el router bloquea mDNS entre clientes. Si nada responde, se
     * intenta la red propia del sensor, que es el caso de "sitio nuevo".
     */
    private void buscarSensor() {
        if (!buscando.compareAndSet(false, true)) return;
        js("window.rESPira && window.rESPira.buscando()");
        new Thread(new Runnable() { @Override public void run() {
            try {
                String ip = prefs.getString("ip", null);
                if (ip != null && responde(ip, 1200)) { ui.post(avisar(ip)); return; }

                String porMdns = porMdns(4000);
                if (porMdns != null) { ui.post(avisar(porMdns)); return; }

                String mia = ipEnWifi();
                if (mia != null) {
                    String hallada = barrer(mia);
                    if (hallada != null) { ui.post(avisar(hallada)); return; }
                }
                ui.post(new Runnable() { @Override public void run() { conectarAlAp(); }});
            } finally {
                buscando.set(false);
            }
        }}, "buscador").start();
    }
    private Runnable avisar(final String ip) {
        return new Runnable() { @Override public void run() { avisaSensor(ip); }};
    }

    /** Es nuestro sensor si /estado.json responde con su JSON caracteristico. */
    private boolean responde(String ip, int ms) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + ip + "/estado.json").openConnection();
            c.setConnectTimeout(ms); c.setReadTimeout(ms);
            if (c.getResponseCode() != 200) return false;
            byte[] b = new byte[200];
            int n = c.getInputStream().read(b);
            return n > 0 && new String(b, 0, n).contains("\"modo\"");
        } catch (Exception e) {
            return false;
        } finally { if (c != null) c.disconnect(); }
    }

    private String porMdns(int ms) {
        final NsdManager nsd = (NsdManager) getSystemService(Context.NSD_SERVICE);
        if (nsd == null) return null;
        final AtomicReference<String> res = new AtomicReference<String>(null);
        final CountDownLatch listo = new CountDownLatch(1);
        final AtomicBoolean resolviendo = new AtomicBoolean(false);
        NsdManager.DiscoveryListener dl = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String t) { }
            @Override public void onDiscoveryStopped(String t) { }
            @Override public void onServiceLost(NsdServiceInfo si) { }
            @Override public void onStopDiscoveryFailed(String t, int e) { }
            @Override public void onStartDiscoveryFailed(String t, int e) { listo.countDown(); }
            @Override public void onServiceFound(NsdServiceInfo si) {
                String n = si.getServiceName();
                if (n == null || !n.toLowerCase().startsWith(MDNS_NOMBRE)) return;
                if (!resolviendo.compareAndSet(false, true)) return;   // solo una a la vez
                nsd.resolveService(si, new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo x, int e) { resolviendo.set(false); }
                    @Override public void onServiceResolved(NsdServiceInfo x) {
                        InetAddress a = x.getHost();
                        if (a instanceof Inet4Address) { res.set(a.getHostAddress()); listo.countDown(); }
                        else resolviendo.set(false);
                    }
                });
            }
        };
        try {
            nsd.discoverServices("_http._tcp", NsdManager.PROTOCOL_DNS_SD, dl);
            listo.await(ms, TimeUnit.MILLISECONDS);
        } catch (Exception ignored) { }
        try { nsd.stopServiceDiscovery(dl); } catch (Exception ignored) { }
        return res.get();
    }

    private String ipEnWifi() {
        try {
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp == null) continue;
                for (LinkAddress la : lp.getLinkAddresses()) {
                    InetAddress a = la.getAddress();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    private String barrer(String mia) {
        int p = mia.lastIndexOf('.');
        if (p < 0) return null;
        final String base = mia.substring(0, p + 1);
        final AtomicReference<String> hallada = new AtomicReference<String>(null);
        ExecutorService pool = Executors.newFixedThreadPool(32);
        for (int i = 1; i <= 254; i++) {
            final String ip = base + i;
            pool.execute(new Runnable() { @Override public void run() {
                if (hallada.get() == null && !ip.equals(base) && responde(ip, 700))
                    hallada.compareAndSet(null, ip);
            }});
        }
        try {
            long limite = System.currentTimeMillis() + 10000;
            while (hallada.get() == null && System.currentTimeMillis() < limite) Thread.sleep(150);
        } catch (InterruptedException ignored) { }
        pool.shutdownNow();
        return hallada.get();
    }

    /** Modo portal: el sensor levanta su propia red porque no conoce ninguna. */
    private void conectarAlAp() {
        WifiNetworkSpecifier spec = new WifiNetworkSpecifier.Builder()
                .setSsid(SSID).setWpa2Passphrase(PASS).build();
        NetworkRequest req = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .setNetworkSpecifier(spec).build();
        cb = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) {
                cm.bindProcessToNetwork(n);
                ui.post(new Runnable() { @Override public void run() {
                    // en modo portal la configuracion la sirve el propio sensor
                    web.loadUrl(AP_URL + "/wifi");
                }});
            }
            @Override public void onUnavailable() {
                ui.post(new Runnable() { @Override public void run() {
                    toast("No encuentro el sensor. ¿Está encendido?");
                }});
            }
            @Override public void onLost(Network n) {
                ui.postDelayed(new Runnable() { @Override public void run() {
                    if (!isFinishing()) { web.loadUrl(INICIO); buscarSensor(); }
                }}, 8000);
            }
        };
        try { cm.requestNetwork(req, cb); }
        catch (Exception e) { toast("No encuentro el sensor."); }
    }

    // ============================================================== el puente ==
    private OutputStream csv = null;

    private class Puente {
        @JavascriptInterface
        public void buscarSensor() { MainActivity.this.buscarSensor(); }

        @JavascriptInterface
        public boolean abrirCsv(String nombre) {
            try {
                cerrarCsv();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
                v.put(MediaStore.Downloads.MIME_TYPE, "text/csv");
                Uri uri = getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                csv = getContentResolver().openOutputStream(uri);
                return csv != null;
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface
        public void trozoCsv(String t) {
            try {
                if (csv != null) csv.write(t.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } catch (Exception ignored) { }
        }
        @JavascriptInterface
        public void cerrarCsv() {
            try { if (csv != null) csv.close(); } catch (Exception ignored) { }
            csv = null;
        }

        /** Trae un fichero del sensor (la caja negra nocturna) a Descargas. */
        @JavascriptInterface
        public void descargarUrl(final String url, final String nombre) {
            new Thread(new Runnable() { @Override public void run() {
                HttpURLConnection c = null;
                try {
                    if (!abrirCsv(nombre)) { avisa("No pude crear el fichero."); return; }
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000); c.setReadTimeout(30000);
                    InputStream in = c.getInputStream();
                    byte[] buf = new byte[8192];
                    long total = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) { csv.write(buf, 0, n); total += n; }
                    cerrarCsv();
                    avisa("Descargado: " + nombre + " (" + (total / 1024) + " KB)");
                } catch (Exception e) {
                    cerrarCsv();
                    avisa("Falló la descarga.");
                } finally { if (c != null) c.disconnect(); }
            }}, "descarga").start();
        }
        private void avisa(final String m) {
            ui.post(new Runnable() { @Override public void run() { toast(m); }});
        }
    }

    private void toast(String m) { Toast.makeText(this, m, Toast.LENGTH_LONG).show(); }

    @Override
    public void onWindowFocusChanged(boolean f) {
        super.onWindowFocusChanged(f);
        if (f) pantallaCompleta();
    }

    /** El atras lo decide la propia app: no debe salirse en mitad de una sesion. */
    @Override
    public void onBackPressed() {
        if (!paginaLista) { super.onBackPressed(); return; }
        web.evaluateJavascript("window.rESPira && window.rESPira.atras()",
            new android.webkit.ValueCallback<String>() {
                @Override public void onReceiveValue(String v) {
                    if (!"true".equals(v)) finish();
                }
            });
    }

    @Override
    protected void onDestroy() {
        try {
            if (cm != null) {
                cm.bindProcessToNetwork(null);
                if (cb != null) cm.unregisterNetworkCallback(cb);
            }
        } catch (Exception ignored) { }
        try { if (csv != null) csv.close(); } catch (Exception ignored) { }
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
