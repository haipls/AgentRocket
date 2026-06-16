const state = {
    tab: 'products',
    products: [],
    customers: [],
    orders: [],
    editing: null,
};

const adminConfig = window.AGENTROCKET_ADMIN_CONFIG || {};
const adminUrlParams = new URLSearchParams(window.location.search);
const adminUrlToken = adminUrlParams.get('token');

if (adminUrlToken) {
    window.localStorage.setItem('agentrocket_admin_token', adminUrlToken);
}

const adminToken = adminUrlToken || window.localStorage.getItem('agentrocket_admin_token') || adminConfig.adminToken || '';
const useLocalApi = adminConfig.useLocalApi === true || !!adminConfig.apiBaseUrl;

const views = {
    products: {
        title: 'Sản phẩm',
        desc: 'Quản lý sản phẩm vật lý, sản phẩm số và dịch vụ.',
        resource: 'products',
        columns: [
            ['id', 'ID'],
            ['name', 'Tên'],
            ['product_type', 'Loại'],
            ['price', 'Giá'],
            ['stock_remaining', 'Tồn kho'],
            ['description', 'Mô tả'],
        ],
    },
    customers: {
        title: 'Khách hàng',
        desc: 'Danh sách khách hàng trong Google Sheets.',
        resource: 'customers',
        columns: [
            ['id', 'ID'],
            ['name', 'Tên'],
            ['phone', 'Điện thoại'],
            ['zalo', 'Zalo'],
            ['registered_at', 'Ngày đăng ký'],
        ],
    },
    orders: {
        title: 'Đơn hàng',
        desc: 'Khi thêm đơn hàng, chỉ sản phẩm vật lý mới bị trừ tồn kho.',
        resource: 'orders',
        columns: [
            ['id', 'ID'],
            ['customer_name', 'Khách hàng'],
            ['product_name', 'Sản phẩm'],
            ['amount', 'Số tiền'],
            ['order_status', 'Trạng thái'],
            ['payment_content', 'Nội dung CK'],
            ['purchased_at', 'Ngày mua'],
            ['paid_at', 'Ngày thanh toán'],
        ],
    },
};

const els = {
    tabs: document.querySelectorAll('.tab'),
    title: document.getElementById('view-title'),
    desc: document.getElementById('view-desc'),
    addBtn: document.getElementById('add-btn'),
    head: document.getElementById('table-head'),
    body: document.getElementById('table-body'),
    empty: document.getElementById('empty-state'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    closeModal: document.getElementById('close-modal'),
    form: document.getElementById('entity-form'),
};

function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('vi-VN').format(number) + 'đ';
}

function moneyInput(value) {
    const number = Number(value || 0);
    if (!number) return '';
    return new Intl.NumberFormat('vi-VN').format(number);
}

function parseMoneyInput(value) {
    return String(value || '').replace(/[^\d]/g, '');
}

function formatDateTimeGMT7(date) {
    const parts = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date).reduce((result, part) => {
        result[part.type] = part.value;
        return result;
    }, {});

    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function nowGMT7Text() {
    return formatDateTimeGMT7(new Date());
}

function formatGMT7(value) {
    if (!value) return '-';
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(value)) return value;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return formatDateTimeGMT7(date);
}

function productTypeLabel(type) {
    return {
        physical: 'Vật lý',
        digital: 'Sản phẩm số',
        service: 'Dịch vụ',
    }[type] || type || '';
}

function formatCell(key, value) {
    if (key === 'price' || key === 'amount') return money(value);
    if (key === 'registered_at' || key === 'purchased_at' || key === 'paid_at') return formatGMT7(value);
    if (key === 'product_type') return productTypeLabel(value);
    if (value === null || value === undefined || value === '') return '-';
    return String(value);
}

function encodePayload(data) {
    const json = JSON.stringify(data || {});
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function appsScriptRequest(action, resource = '', data = {}) {
    if (!adminConfig.appsScriptUrl) {
        return Promise.reject(new Error('Chưa cấu hình Apps Script URL trong admin/admin-config.js.'));
    }

    return new Promise((resolve, reject) => {
        const callbackName = `agentRocketAdmin_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const script = document.createElement('script');
        const url = new URL(adminConfig.appsScriptUrl);

        url.searchParams.set('admin', '1');
        url.searchParams.set('action', action);
        if (resource) url.searchParams.set('resource', resource);
        if (adminToken) url.searchParams.set('token', adminToken);
        if (data && Object.keys(data).length > 0) url.searchParams.set('payload', encodePayload(data));
        url.searchParams.set('callback', callbackName);

        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error('Không nhận được phản hồi từ Apps Script.'));
        }, 20000);

        function cleanup() {
            window.clearTimeout(timeout);
            delete window[callbackName];
            script.remove();
        }

        window[callbackName] = response => {
            cleanup();
            if (!response || !response.ok) {
                reject(new Error((response && response.error) || 'API lỗi.'));
                return;
            }
            resolve(response);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('Không tải được Apps Script API.'));
        };

        script.src = url.toString();
        document.body.appendChild(script);
    });
}

async function api(action, resource = '', payload = {}) {
    if (useLocalApi) {
        return localApiRequest(action, resource, payload);
    }

    const response = await appsScriptRequest(action, resource, payload);
    if (!response.ok) throw new Error(response.error || 'API lỗi.');
    return response;
}

async function localApiRequest(action, resource = '', payload = {}) {
    const baseUrl = adminConfig.apiBaseUrl || '/api';

    if (action === 'list_all') {
        const [products, customers, orders] = await Promise.all([
            localApiFetch(`${baseUrl}/products`),
            localApiFetch(`${baseUrl}/customers`),
            localApiFetch(`${baseUrl}/orders`),
        ]);

        return {
            ok: true,
            data: {
                products: products.data || [],
                customers: customers.data || [],
                orders: orders.data || [],
            },
        };
    }

    const methodMap = {
        create: 'POST',
        update: 'PUT',
        delete: 'DELETE',
    };
    const method = methodMap[action];

    if (!method || !resource) {
        throw new Error('API local không hỗ trợ thao tác này.');
    }

    const id = payload && payload.id ? `/${encodeURIComponent(payload.id)}` : '';
    const body = { ...payload };
    delete body.id;

    return localApiFetch(`${baseUrl}/${resource}${method === 'POST' ? '' : id}`, {
        method,
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
    });
}

async function localApiFetch(url, options = {}) {
    const requestUrl = new URL(url, window.location.origin);
    if (adminToken) {
        requestUrl.searchParams.set('token', adminToken);
    }

    const response = await fetch(requestUrl.toString(), {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(adminToken ? { 'x-admin-token': adminToken } : {}),
            ...(options.headers || {}),
        },
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
        throw new Error(data.error || 'API local lỗi.');
    }

    return data;
}

async function sendAdminOrderConfirmation(orderData) {
    const customer = state.customers.find(item => String(item.id) === String(orderData.customer_id)) || {};
    const product = state.products.find(item => String(item.id) === String(orderData.product_id)) || {};
    const response = await fetch('/.netlify/functions/admin-order-confirmation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            order: {
                ...orderData,
                product_name: product.name || ''
            },
            customer,
            product
        })
    });

    if (!response.ok) {
        throw new Error('Không gửi được email xác nhận đơn hàng.');
    }

    return response.json();
}

async function loadAll() {
    const response = await api('list_all');
    state.products = response.data.products || [];
    state.customers = response.data.customers || [];
    state.orders = response.data.orders || [];
    render();
}

function render() {
    const view = views[state.tab];
    const rows = state[state.tab];
    els.title.textContent = view.title;
    els.desc.textContent = view.desc;
    els.head.innerHTML = `
        <tr>
            ${view.columns.map(([, label]) => `<th>${label}</th>`).join('')}
            <th>Thao tác</th>
        </tr>
    `;
    els.body.innerHTML = rows.map(row => `
        <tr>
            ${view.columns.map(([key]) => `<td>${formatCell(key, row[key])}</td>`).join('')}
            <td class="actions">
                <button class="secondary-btn" data-action="edit" data-id="${row.id}">Sửa</button>
                <button class="danger-btn" data-action="delete" data-id="${row.id}">Xóa</button>
            </td>
        </tr>
    `).join('');
    els.empty.hidden = rows.length > 0;
}

function input(name, label, value = '', type = 'text', required = false, placeholder = '') {
    return `
        <div class="field">
            <label for="${name}">${label}</label>
            <input id="${name}" name="${name}" type="${type}" value="${value ?? ''}" ${placeholder ? `placeholder="${placeholder}"` : ''} ${required ? 'required' : ''}>
        </div>
    `;
}

function textarea(name, label, value = '') {
    return `
        <div class="field">
            <label for="${name}">${label}</label>
            <textarea id="${name}" name="${name}">${value ?? ''}</textarea>
        </div>
    `;
}

function select(name, label, options, value = '', required = false) {
    return `
        <div class="field">
            <label for="${name}">${label}</label>
            <select id="${name}" name="${name}" ${required ? 'required' : ''}>
                ${options.map(option => `
                    <option value="${option.value}" ${String(option.value) === String(value) ? 'selected' : ''}>${option.label}</option>
                `).join('')}
            </select>
        </div>
    `;
}

function openModal(row = null) {
    state.editing = row;
    els.modalTitle.textContent = row ? 'Chỉnh sửa' : 'Thêm mới';
    els.form.innerHTML = buildForm(row || {}) + `
        <div class="form-actions">
            <button type="button" class="secondary-btn" id="cancel-form">Hủy</button>
            <button type="submit" class="primary-btn">Lưu</button>
        </div>
    `;
    els.modal.hidden = false;
    document.getElementById('cancel-form').addEventListener('click', closeModal);
}

function buildForm(row) {
    if (state.tab === 'products') {
        return [
            input('name', 'Tên sản phẩm', row.name, 'text', true),
            select('product_type', 'Loại sản phẩm', [
                { value: 'physical', label: 'Vật lý' },
                { value: 'digital', label: 'Sản phẩm số' },
                { value: 'service', label: 'Dịch vụ' },
            ], row.product_type || 'service', true),
            input('price', 'Giá', moneyInput(row.price), 'text', true),
            input('stock_remaining', 'Tồn kho', row.stock_remaining ?? '', 'number', false),
            textarea('description', 'Mô tả', row.description),
        ].join('');
    }

    if (state.tab === 'customers') {
        return [
            input('name', 'Tên khách hàng', row.name, 'text', true),
            input('phone', 'Điện thoại', row.phone),
            input('zalo', 'Zalo', row.zalo),
            input('registered_at', 'Ngày đăng ký GMT+7', row.registered_at ? formatGMT7(row.registered_at) : nowGMT7Text(), 'text', false, 'dd/MM/YYYY HH:MM'),
        ].join('');
    }

    return [
        select('customer_id', 'Khách hàng', state.customers.map(customer => ({
            value: customer.id,
            label: `${customer.name} (#${customer.id})`,
        })), row.customer_id, true),
        select('product_id', 'Sản phẩm', state.products.map(product => ({
            value: product.id,
            label: `${product.name} - ${productTypeLabel(product.product_type)} (#${product.id})`,
        })), row.product_id, true),
        input('amount', 'Số tiền', moneyInput(row.amount), 'text', true),
        select('order_status', 'Trạng thái', [
            { value: 'new', label: 'Mới' },
            { value: 'paid', label: 'Đã thanh toán' },
            { value: 'processing', label: 'Đang xử lý' },
            { value: 'done', label: 'Hoàn tất' },
            { value: 'cancelled', label: 'Đã hủy' },
        ], row.order_status || 'new', true),
        input('purchased_at', 'Ngày mua GMT+7', row.purchased_at ? formatGMT7(row.purchased_at) : nowGMT7Text(), 'text', false, 'dd/MM/YYYY HH:MM'),
    ].join('');
}

function closeModal() {
    els.modal.hidden = true;
    state.editing = null;
}

function formDataObject(form) {
    const data = {};
    new FormData(form).forEach((value, key) => {
        data[key] = value;
    });

    if ('price' in data) {
        data.price = parseMoneyInput(data.price);
    }

    if ('amount' in data) {
        data.amount = parseMoneyInput(data.amount);
    }

    return data;
}

async function saveCurrent(event) {
    event.preventDefault();
    const view = views[state.tab];
    const data = formDataObject(els.form);
    const isEdit = Boolean(state.editing);
    const previousStatus = state.editing && state.editing.order_status;
    if (isEdit) data.id = state.editing.id;
    await api(isEdit ? 'update' : 'create', view.resource, data);
    const shouldSendOrderConfirmation = view.resource === 'orders'
        && data.order_status === 'paid'
        && (!isEdit || previousStatus !== 'paid');

    if (shouldSendOrderConfirmation) {
        const emailResult = await sendAdminOrderConfirmation(data);
        if (emailResult.skipped) {
            alert('Đơn đã lưu, nhưng chưa gửi email vì khách hàng không có email hợp lệ trong trường Zalo.');
        } else {
            alert('Đã gửi email xác nhận đơn hàng cho khách.');
        }
    }
    closeModal();
    await loadAll();
}

async function deleteCurrent(id) {
    if (!confirm('Xóa dòng này?')) return;
    const view = views[state.tab];
    await api('delete', view.resource, { id });
    await loadAll();
}

els.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        state.tab = tab.dataset.tab;
        els.tabs.forEach(item => item.classList.toggle('active', item === tab));
        render();
    });
});

els.addBtn.addEventListener('click', () => openModal());
els.closeModal.addEventListener('click', closeModal);
els.form.addEventListener('submit', saveCurrent);
els.form.addEventListener('input', event => {
    const field = event.target;
    if (field.name !== 'price' && field.name !== 'amount') return;

    const digits = parseMoneyInput(field.value);
    field.value = digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : '';
});
els.body.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.id;
    const row = state[state.tab].find(item => String(item.id) === String(id));
    if (button.dataset.action === 'edit') openModal(row);
    if (button.dataset.action === 'delete') deleteCurrent(id);
});

loadAll().catch(error => {
    els.empty.hidden = false;
    els.empty.textContent = error.message;
    alert(error.message);
});

window.setInterval(() => {
    loadAll().catch(error => {
        els.empty.hidden = false;
        els.empty.textContent = error.message;
    });
}, 30000);
