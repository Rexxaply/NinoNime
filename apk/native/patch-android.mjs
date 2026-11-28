// Menambahkan "melayang di luar aplikasi" (Picture-in-Picture Android) ke proyek Capacitor yang baru dibuat `npx cap add android`.
// Dipanggil workflow: node native/patch-android.mjs <appId>
// - AndroidManifest: activity mendukung PiP
// - MainActivity: PiP otomatis saat tombol Home ditekan ketika video diputar
//     Android 12+  : setAutoEnterEnabled (transisi mulus dari sistem)
//     Android 8–11 : onUserLeaveHint → enterPictureInPictureMode
//   lalu memberi tahu halaman web (event "ninopip") supaya hanya video yang ditampilkan di jendela kecil
// - Plugin NinoPip (dipanggil dari js/player.js): setPlaying({ playing }), enter()
import fs from "node:fs";
import path from "node:path";

const appId = process.argv[2];
if (!appId) { console.error("pakai: node patch-android.mjs <appId>"); process.exit(1); }
const pkgDir = path.join("android/app/src/main/java", ...appId.split("."));
fs.mkdirSync(pkgDir, { recursive: true });

// 1) manifest
const mf = "android/app/src/main/AndroidManifest.xml";
let m = fs.readFileSync(mf, "utf8");
if (!m.includes("supportsPictureInPicture")) m = m.replace(/<activity\b/, '<activity\n            android:supportsPictureInPicture="true"\n            android:resizeableActivity="true"');
m = m.replace(/android:configChanges="([^"]*)"/, (all, v) => { const need = ["orientation", "screenSize", "smallestScreenSize", "screenLayout"]; const have = new Set(v.split("|")); need.forEach((n) => have.add(n)); return `android:configChanges="${[...have].join("|")}"`; });
fs.writeFileSync(mf, m);

// 2) MainActivity
fs.writeFileSync(path.join(pkgDir, "MainActivity.java"), `package ${appId};

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private volatile boolean playing = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NinoPipPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // dipanggil plugin: video sedang diputar (dan sakelar "Melayang di luar aplikasi" aktif)
    public void setPlaying(boolean p) {
        playing = p;
        runOnUiThread(this::applyParams);
    }

    private PictureInPictureParams params() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9));
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(playing).setSeamlessResizeEnabled(true);
        return b.build();
    }

    private void applyParams() {
        if (Build.VERSION.SDK_INT >= 26) {
            try { setPictureInPictureParams(params()); } catch (Exception ignored) { }
        }
    }

    // tombol PiP di pemutar
    public boolean enterPip() {
        if (Build.VERSION.SDK_INT < 26) return false;
        try { return enterPictureInPictureMode(params()); } catch (Exception e) { return false; }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Android 12+ masuk otomatis lewat setAutoEnterEnabled; versi lebih lama lewat sini
        if (playing && Build.VERSION.SDK_INT >= 26 && Build.VERSION.SDK_INT < 31) enterPip();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration cfg) {
        super.onPictureInPictureModeChanged(inPip, cfg);
        if (getBridge() != null) {
            getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('ninopip',{detail:" + inPip + "}))", null);
        }
    }
}
`);

// 3) plugin
fs.writeFileSync(path.join(pkgDir, "NinoPipPlugin.java"), `package ${appId};

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NinoPip")
public class NinoPipPlugin extends Plugin {
    @PluginMethod
    public void setPlaying(PluginCall call) {
        ((MainActivity) getActivity()).setPlaying(Boolean.TRUE.equals(call.getBoolean("playing", false)));
        call.resolve();
    }

    @PluginMethod
    public void enter(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject r = new JSObject();
            r.put("ok", ((MainActivity) getActivity()).enterPip());
            call.resolve(r);
        });
    }
}
`);
console.log("PiP Android ditambahkan untuk", appId);
