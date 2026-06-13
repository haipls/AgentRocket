(function () {
    const syncConfig = window.AGENTROCKET_PAYMENT_CONFIG || {};

    function encodePayload(data) {
        const json = JSON.stringify(data || {});
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function request(action, data) {
        if (syncConfig.appsScriptUrl) {
            return requestAppsScript(action, data);
        }

        return Promise.resolve({ ok: false, skipped: true, error: 'Chưa cấu hình Apps Script URL.' });
    }

    function requestAppsScript(action, data) {
        return new Promise(resolve => {
            const callbackName = `agentRocketPay_${Date.now()}_${Math.random().toString(16).slice(2)}`;
            const script = document.createElement('script');
            const url = new URL(syncConfig.appsScriptUrl);
            const timeout = window.setTimeout(() => {
                cleanup();
                resolve({ ok: false, error: 'Không nhận được phản hồi đồng bộ thanh toán.' });
            }, 12000);

            function cleanup() {
                window.clearTimeout(timeout);
                delete window[callbackName];
                script.remove();
            }

            window[callbackName] = response => {
                cleanup();
                resolve(response || { ok: false, error: 'Phản hồi thanh toán rỗng.' });
            };

            script.onerror = () => {
                cleanup();
                resolve({ ok: false, error: 'Không tải được Apps Script API thanh toán.' });
            };

            url.searchParams.set('payment', '1');
            url.searchParams.set('action', action);
            url.searchParams.set('payload', encodePayload(data));
            url.searchParams.set('callback', callbackName);

            script.src = url.toString();
            document.body.appendChild(script);
        });
    }

    function sanitize(value) {
        return String(value || '').replace(/[^A-Za-z0-9]/g, '').slice(-16);
    }

    function buildOrderId(productCode, storageSuffix) {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = sanitize(params.get('orderId'));
        if (fromUrl) return fromUrl;

        const suffix = sanitize(storageSuffix);
        const storageKey = suffix
            ? `agentrocket_order_${productCode}_${suffix}`
            : `agentrocket_order_${productCode}`;
        const existing = window.localStorage.getItem(storageKey);
        if (existing) return existing;

        const generated = `O${new Date().getTime().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
        window.localStorage.setItem(storageKey, generated);
        return generated;
    }

    function buildCustomer() {
        const params = new URLSearchParams(window.location.search);
        return {
            name: params.get('name') || params.get('fullname') || '',
            phone: params.get('phone') || '',
            zalo: params.get('zalo') || params.get('email') || '',
            leadId: params.get('leadId') || ''
        };
    }

    function setupPaymentPage(pageConfig) {
        const config = {
            ...pageConfig,
            productType: pageConfig.productType || 'service'
        };
        const customer = config.customer || buildCustomer();
        const orderId = buildOrderId(config.productCode, config.orderStorageKeySuffix || customer.phone || customer.zalo || customer.leadId);
        const transferContent = `${config.transferPrefix} ${orderId}`;

        config.orderId = orderId;
        config.transferContent = transferContent;

        const result = {
            orderId,
            transferContent,
            syncPending: () => request('create_pending_order', {
                orderId,
                productCode: config.productCode,
                productName: config.productName,
                productType: config.productType,
                amount: config.amount,
                transferContent,
                customer,
                pageUrl: window.location.href
            }),
            checkStatus: () => request('get_order_status', {
                orderId
            })
        };

        window.AGENTROCKET_CURRENT_PAYMENT = result;
        return result;
    }

    window.AgentRocketPaymentSync = {
        setupPaymentPage,
        request
    };
}());
