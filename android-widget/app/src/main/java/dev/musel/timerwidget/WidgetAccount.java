package dev.musel.timerwidget;

final class WidgetAccount {
    interface Display {
        void clear();
        void refresh();
    }

    private final PlannerApi api;
    private final Display display;
    private final Object lock;

    WidgetAccount(PlannerApi api, Display display, Object lock) {
        this.api = api;
        this.display = display;
        this.lock = lock;
    }

    String checkAccount() throws Exception {
        synchronized (lock) {
            try {
                String account = api.currentAccount();
                if (account == null) display.clear();
                else display.refresh();
                return account;
            } catch (PlannerApi.AuthenticationException error) {
                display.clear();
                throw error;
            }
        }
    }

    String signIn(String username, String password) throws Exception {
        synchronized (lock) {
            display.clear();
            try { return api.signIn(username, password); }
            finally { display.refresh(); }
        }
    }

    void signOut() {
        synchronized (lock) {
            try { api.signOut(); }
            finally {
                display.clear();
                display.refresh();
            }
        }
    }
}
