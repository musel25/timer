package dev.musel.timerwidget;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private TextView status;
    private View form;
    private EditText username;
    private EditText password;
    private Button signIn;
    private Button openPlanner;
    private Button updateApp;
    private Button signOut;
    private File pendingApk;
    private boolean awaitingInstallPermission;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        status = findViewById(R.id.status);
        form = findViewById(R.id.login_form);
        username = findViewById(R.id.username);
        password = findViewById(R.id.password);
        signIn = findViewById(R.id.sign_in);
        openPlanner = findViewById(R.id.open_planner);
        updateApp = findViewById(R.id.update_app);
        signOut = findViewById(R.id.sign_out);

        signIn.setOnClickListener(view -> signIn());
        openPlanner.setOnClickListener(view -> startActivity(
            new Intent(Intent.ACTION_VIEW, Uri.parse(PlannerApi.SITE))));
        signOut.setOnClickListener(view -> signOut());
        checkAccount();
        checkForUpdate();
    }

    private void checkForUpdate() {
        worker.execute(() -> {
            try {
                String version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                ReleaseUpdate.Available update = ReleaseUpdate.check(new URL(ReleaseUpdate.API), version);
                if (update == null) return;
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    updateApp.setText(getString(R.string.update_available, update.version));
                    updateApp.setOnClickListener(view -> downloadUpdate(update));
                    updateApp.setVisibility(View.VISIBLE);
                });
            } catch (Exception ignored) { /* Updates can wait until the next app launch. */ }
        });
    }

    private void downloadUpdate(ReleaseUpdate.Available update) {
        if (pendingApk != null && pendingApk.isFile()) {
            requestInstall();
            return;
        }
        updateApp.setEnabled(false);
        status.setText(R.string.downloading_update);
        worker.execute(() -> {
            try {
                File directory = new File(getCacheDir(), "updates");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create update cache");
                File apk = new File(directory, "PlannerWidget.apk");
                ReleaseUpdate.download(new URL(update.downloadUrl), apk);
                PackageInfo archive = getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                PackageInfo installed = getPackageManager().getPackageInfo(getPackageName(), 0);
                if (archive == null || !getPackageName().equals(archive.packageName)
                    || archive.versionCode <= installed.versionCode) {
                    apk.delete();
                    throw new IOException("Downloaded APK is not an update for this app");
                }
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    pendingApk = apk;
                    requestInstall();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    status.setText(R.string.update_download_failed);
                    updateApp.setEnabled(true);
                });
            }
        });
    }

    private void requestInstall() {
        if (!getPackageManager().canRequestPackageInstalls()) {
            awaitingInstallPermission = true;
            status.setText(R.string.allow_update_installs);
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())));
            } catch (ActivityNotFoundException error) {
                awaitingInstallPermission = false;
                status.setText(R.string.update_install_failed);
                updateApp.setEnabled(true);
            }
            return;
        }
        try {
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".updates", pendingApk);
            Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(apkUri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(install);
            status.setText(R.string.approve_update);
        } catch (RuntimeException error) {
            status.setText(R.string.update_install_failed);
        }
        updateApp.setEnabled(true);
    }

    @Override protected void onResume() {
        super.onResume();
        if (!awaitingInstallPermission) return;
        awaitingInstallPermission = false;
        if (getPackageManager().canRequestPackageInstalls()) requestInstall();
        else {
            status.setText(R.string.allow_update_installs);
            updateApp.setEnabled(true);
        }
    }

    private void checkAccount() {
        worker.execute(() -> {
            try {
                String account = PlannerApi.forAndroid().currentAccount();
                if (account == null) hideWidget();
                runOnUiThread(() -> showAccount(account));
            } catch (Exception error) {
                hideWidget();
                runOnUiThread(() -> {
                    showAccount(null);
                    status.setText(R.string.account_check_failed);
                });
            }
        });
    }

    private void signIn() {
        String name = username.getText().toString().trim();
        String secret = password.getText().toString();
        if (name.isEmpty() || secret.isEmpty()) {
            status.setText(R.string.enter_credentials);
            return;
        }
        signIn.setEnabled(false);
        status.setText(R.string.signing_in);
        worker.execute(() -> {
            try {
                String account = widgetAccount().signIn(name, secret);
                runOnUiThread(() -> {
                    password.setText("");
                    showAccount(account);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    password.setText("");
                    signIn.setEnabled(true);
                    status.setText(R.string.sign_in_failed);
                });
            }
        });
    }

    private void signOut() {
        signOut.setEnabled(false);
        worker.execute(() -> {
            widgetAccount().signOut();
            runOnUiThread(() -> {
                showAccount(null);
            });
        });
    }

    private WidgetAccount widgetAccount() {
        return new WidgetAccount(PlannerApi.forAndroid(), new WidgetAccount.Display() {
            @Override public void clear() { WeekWidgetProvider.clearAll(MainActivity.this); }
            @Override public void refresh() { WeekWidgetProvider.refreshAll(MainActivity.this); }
        }, WeekWidgetProvider.SESSION_LOCK);
    }

    private void hideWidget() {
        synchronized (WeekWidgetProvider.SESSION_LOCK) { WeekWidgetProvider.clearAll(this); }
    }

    private void showAccount(String account) {
        boolean signedIn = account != null;
        status.setText(signedIn ? getString(R.string.signed_in_as, account) : getString(R.string.sign_in_to_load));
        form.setVisibility(signedIn ? View.GONE : View.VISIBLE);
        openPlanner.setVisibility(signedIn ? View.VISIBLE : View.GONE);
        signOut.setVisibility(signedIn ? View.VISIBLE : View.GONE);
        signIn.setEnabled(true);
        signOut.setEnabled(true);
    }

    @Override protected void onDestroy() {
        worker.shutdown();
        super.onDestroy();
    }
}
