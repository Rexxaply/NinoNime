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

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private volatile boolean playing = false, paused = true, hasNext = false;
    private static final String PIP_ACTION = "${appId}.PIP_ACTION";
    private BroadcastReceiver pipRx;
    private volatile Rect hint = null;   // posisi video di layar → animasi masuk jendela melayang dari video itu

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NinoPipPlugin.class);
        super.onCreate(savedInstanceState);
        // latar jendela = warna aplikasi (bawaan tema gelap Android abu-abu #303030)
        getWindow().setBackgroundDrawable(new ColorDrawable(0xFF0B1018));
        // tombol di jendela melayang (mundur/maju 5 dtk, putar/jeda, episode berikutnya) → diteruskan ke pemutar web
        pipRx = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                String cmd = i.getStringExtra("cmd");
                if (cmd == null || !cmd.matches("[a-z0-9]+") || getBridge() == null) return;
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('ninopipcmd',{detail:'" + cmd + "'}))", null);
            }
        };
        IntentFilter f = new IntentFilter(PIP_ACTION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(pipRx, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(pipRx, f);
    }

    @Override
    public void onDestroy() {
        try { if (pipRx != null) unregisterReceiver(pipRx); } catch (Exception ignored) { }
        super.onDestroy();
    }

    // dipanggil plugin: video sedang diputar (dan sakelar "Melayang di luar aplikasi" aktif) → masuk otomatis saat Home
    public void setPlaying(boolean p) {
        playing = p;
        runOnUiThread(this::applyParams);
    }

    // dipanggil plugin: keadaan pemutar untuk tombol di jendela melayang
    public void setMedia(boolean isPaused, boolean next) {
        paused = isPaused; hasNext = next;
        runOnUiThread(this::applyParams);
    }

    // dipanggil plugin: posisi video (piksel CSS dari halaman web) → piksel layar
    public void setHint(double x, double y, double w, double h, double dpr) {
        runOnUiThread(() -> {
            if (w <= 0 || h <= 0) { hint = null; applyParams(); return; }
            int[] loc = new int[2];
            try { getBridge().getWebView().getLocationInWindow(loc); } catch (Exception ignored) { }
            hint = new Rect((int) Math.round(x * dpr) + loc[0], (int) Math.round(y * dpr) + loc[1],
                (int) Math.round((x + w) * dpr) + loc[0], (int) Math.round((y + h) * dpr) + loc[1]);
            applyParams();
        });
    }

    private RemoteAction action(int icon, String title, String cmd, int req) {
        Intent i = new Intent(PIP_ACTION).setPackage(getPackageName()).putExtra("cmd", cmd);
        PendingIntent pi = PendingIntent.getBroadcast(this, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new RemoteAction(Icon.createWithResource(this, icon), title, title, pi);
    }

    private List<RemoteAction> actions() {
        RemoteAction back = action(android.R.drawable.ic_media_rew, "Mundur 5 detik", "back5", 1);
        RemoteAction toggle = paused ? action(android.R.drawable.ic_media_play, "Putar", "toggle", 2) : action(android.R.drawable.ic_media_pause, "Jeda", "toggle", 2);
        RemoteAction fwd = action(android.R.drawable.ic_media_ff, "Maju 5 detik", "fwd5", 3);
        RemoteAction next = hasNext ? action(android.R.drawable.ic_media_next, "Episode berikutnya", "next", 4) : null;
        int max = 3;
        try { max = getMaxNumPictureInPictureActions(); } catch (Exception ignored) { }
        List<RemoteAction> a = new ArrayList<>();
        // urutan tampil: mundur · putar/jeda · maju · berikutnya; bila slot kurang, "mundur" dilepas lebih dulu, lalu "maju"
        int room = Math.max(1, max) - 1 - (next != null ? 1 : 0);
        if (room >= 2) a.add(back);
        a.add(toggle);
        if (room >= 1) a.add(fwd);
        if (next != null && a.size() < max) a.add(next);
        return a;
    }

    private PictureInPictureParams params() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).setActions(actions());
        if (hint != null) b.setSourceRectHint(hint);
        // video: ubah ukuran TANPA "seamless" (anjuran Android untuk video) → ketuk 2x untuk memperbesar tidak lagi
        // menampilkan gambar lama di pojok kotak hitam selama halaman web menyesuaikan ukuran
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(playing).setSeamlessResizeEnabled(false);
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
    public void setMedia(PluginCall call) {
        ((MainActivity) getActivity()).setMedia(Boolean.TRUE.equals(call.getBoolean("paused", true)), Boolean.TRUE.equals(call.getBoolean("hasNext", false)));
        call.resolve();
    }

    @PluginMethod
    public void setHint(PluginCall call) {
        ((MainActivity) getActivity()).setHint(call.getDouble("x", 0.0), call.getDouble("y", 0.0), call.getDouble("w", 0.0), call.getDouble("h", 0.0), call.getDouble("dpr", 1.0));
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

// 2b) tema (sama dengan Ninokuu): latar jendela & bilah status/navigasi sewarna aplikasi, dan KELUAR dari
// edge-to-edge paksa Android 15. Tanpa itu Capacitor menyisakan jarak setinggi bilah navigasi di bawah halaman
// walau keyboard sudah menutupinya → kotak kosong di atas keyboard (kartu login terpotong).
const st = "android/app/src/main/res/values/styles.xml";
if (fs.existsSync(st)) {
  let x = fs.readFileSync(st, "utf8");
  const items = ["statusBarColor", "navigationBarColor", "windowBackground"].map((k) => `<item name="android:${k}">@color/nn_bg</item>`)
    .concat(['<item name="android:windowLightStatusBar">false</item>', '<item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>'])
    .map((i) => `\n        ${i}`).join("");
  if (!x.includes("nn-bg")) {
    x = x.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, `$1\n        <!-- nn-bg -->${items}`);
    x = x.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/, `$1\n        <!-- nn-bg -->${items}`);
  }
  fs.writeFileSync(st, x);
  fs.writeFileSync("android/app/src/main/res/values/nn_colors.xml", `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="nn_bg">#0B1018</color>\n</resources>\n`);
}

console.log("PiP Android ditambahkan untuk", appId);
