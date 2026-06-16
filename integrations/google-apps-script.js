const SHEET_ID = '';
const SHEET_NAME = '';
const TELEGRAM_BOT_TOKEN = '';
const TELEGRAM_CHAT_ID = '';
const ADMIN_TOKEN = '';
const SEPAY_WEBHOOK_TOKEN = '';

const ADMIN_RESOURCES = {
  products: {
    sheetName: 'Products',
    headers: ['id', 'name', 'product_type', 'price', 'description', 'stock_remaining']
  },
  customers: {
    sheetName: 'Customers',
    headers: ['id', 'name', 'phone', 'zalo', 'registered_at']
  },
  orders: {
    sheetName: 'Orders',
    headers: [
      'id',
      'customer_id',
      'product_id',
      'amount',
      'order_status',
      'purchased_at',
      'payment_content',
      'product_code',
      'source_url',
      'paid_at',
      'gateway',
      'gateway_transaction_id',
      'gateway_raw'
    ]
  }
};

const PAYMENT_PRODUCTS = {
  FLOWLEAD: {
    name: 'Bản Đồ Flow Lead 1 Trang',
    productType: 'digital',
    amount: 2000
  },
  ARSDFY: {
    name: 'Agent Rocket Sales - Done For You',
    productType: 'service',
    amount: 12000000
  },
  ARFLOW: {
    name: 'Phí cấu hình triển khai AgentRocket AI',
    productType: 'service',
    amount: 12000000
  },
  AR12D: {
    name: 'Thử Thách AI 12 Ngày Tạo Hệ Thống Bán Hàng Của Riêng Bạn',
    productType: 'service',
    amount: 5000000
  }
};

const REQUIRED_COLUMNS = [
  'Lead ID',
  'Trạng thái',
  'Thời gian gửi',
  'Thời gian khảo sát',
  'Nguồn',
  'URL trang',
  'Họ và tên',
  'Doanh nghiệp',
  'Số điện thoại',
  'Email hoặc Zalo',
  'Ngành',
  'Quy mô',
  'Doanh thu',
  'Lead mỗi tháng',
  'Vấn đề chính',
  'ROI - Nhân sự',
  'ROI - Lương',
  'ROI - % tác vụ lặp lại',
  'ROI - % tự động hóa',
  'ROI - Lead/tháng',
  'ROI - Tỷ lệ chốt',
  'ROI - AOV',
  'ROI - Tiết kiệm ước tính',
  'ROI - Doanh thu tăng thêm',
  'ROI - ROI ròng',
  'User Agent',
  'Khảo sát - Kênh lead chính',
  'Khảo sát - Nơi lưu lead',
  'Khảo sát - Tác vụ AI ưu tiên',
  'Khảo sát - Mức độ sẵn sàng'
];

function doPost(e) {
  if (e && e.parameter && e.parameter.sepay === '1') {
    return handleSepayWebhook(e);
  }

  try {
    assertConfigured();

    const payload = parsePayload(e);
    const sheet = getLeadSheet();
    ensureHeaderRow(sheet);

    upsertLeadRow(sheet, payload, 'qualified');
    notifyTelegram(payload);

    return jsonResponse({
      ok: true
    });
  } catch (error) {
    notifyTelegramError(error);

    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.mcp === '1') {
    return handleMcpRequest(e);
  }

  if (e && e.parameter && e.parameter.admin === '1') {
    return handleAdminRequest(e);
  }

  if (e && e.parameter && e.parameter.payment === '1') {
    return handlePaymentRequest(e);
  }

  try {
    assertConfigured();
    const sheet = getLeadSheet();
    ensureHeaderRow(sheet);

    return jsonResponse({
      ok: true,
      message: 'Webhook đã kết nối được Google Sheet.',
      sheetName: sheet.getName()
    });
  } catch (error) {
    notifyTelegramError(error);

    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

function assertConfigured() {
  const missingKeys = [];

  if (!SHEET_ID) missingKeys.push('SHEET_ID');
  if (!SHEET_NAME) missingKeys.push('SHEET_NAME');
  if (!TELEGRAM_BOT_TOKEN) missingKeys.push('TELEGRAM_BOT_TOKEN');
  if (!TELEGRAM_CHAT_ID) missingKeys.push('TELEGRAM_CHAT_ID');

  if (missingKeys.length > 0) {
    throw new Error('Thiếu cấu hình: ' + missingKeys.join(', '));
  }

  if (SHEET_ID === '0') {
    throw new Error('SHEET_ID đang là "0", cần thay bằng Google Sheet ID thật.');
  }
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Không nhận được dữ liệu form');
  }

  return JSON.parse(e.postData.contents);
}

function getLeadSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('Không tìm thấy sheet tab: ' + SHEET_NAME);
  }

  return sheet;
}

function ensureHeaderRow(sheet) {
  const lastColumn = sheet.getLastColumn();
  const existingHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    : [];
  const hasHeaders = existingHeaders.some(function (value) {
    return value !== '';
  });

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, REQUIRED_COLUMNS.length).setValues([REQUIRED_COLUMNS]);
    return;
  }

  const headers = getHeaders(sheet);
  const missingHeaders = REQUIRED_COLUMNS.filter(function (header) {
    return headers.indexOf(header) === -1;
  });

  if (missingHeaders.length > 0) {
    sheet
      .getRange(1, headers.length + 1, 1, missingHeaders.length)
      .setValues([missingHeaders]);
  }
}

function getHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    return [];
  }

  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function buildLeadRow(sheet, payload) {
  const headers = getHeaders(sheet);
  const record = buildLeadRecord(payload);

  return headers.map(function (header) {
    return record[header] || '';
  });
}

function buildLeadRecord(payload) {
  const lead = payload.lead || {};
  const roi = payload.roi || {};
  const survey = payload.survey || {};
  const hasSurveyDetails = Object.keys(survey).some(function (key) {
    return survey[key] !== '';
  });

  return {
    'Lead ID': payload.leadId || '',
    'Trạng thái': payload.status || '',
    'Thời gian gửi': payload.submittedAt || '',
    'Thời gian khảo sát': hasSurveyDetails ? (payload.submittedAt || '') : '',
    'Nguồn': payload.source || '',
    'URL trang': payload.pageUrl || '',
    'Họ và tên': lead.fullname || '',
    'Doanh nghiệp': lead.company || '',
    'Số điện thoại': lead.phone || '',
    'Email hoặc Zalo': lead.email || '',
    'Ngành': lead.industry || '',
    'Quy mô': lead.size || '',
    'Doanh thu': lead.revenue || '',
    'Lead mỗi tháng': lead.leads || '',
    'Vấn đề chính': lead.pain || '',
    'ROI - Nhân sự': roi.staff || '',
    'ROI - Lương': roi.salary || '',
    'ROI - % tác vụ lặp lại': roi.repetitiveTimePercent || '',
    'ROI - % tự động hóa': roi.automationPercent || '',
    'ROI - Lead/tháng': roi.leadsMonthly || '',
    'ROI - Tỷ lệ chốt': roi.conversionRate || '',
    'ROI - AOV': roi.averageOrderValue || '',
    'ROI - Tiết kiệm ước tính': roi.savingEstimated || '',
    'ROI - Doanh thu tăng thêm': roi.revenueEstimated || '',
    'ROI - ROI ròng': roi.netRoiEstimated || '',
    'User Agent': payload.userAgent || '',
    'Khảo sát - Kênh lead chính': survey.leadChannel || '',
    'Khảo sát - Nơi lưu lead': survey.leadStorage || '',
    'Khảo sát - Tác vụ AI ưu tiên': survey.firstAiTask || '',
    'Khảo sát - Mức độ sẵn sàng': survey.readiness || ''
  };
}

function upsertLeadRow(sheet, payload, status) {
  if (!payload.leadId) {
    throw new Error('Thiếu Lead ID cho lead.');
  }

  payload.status = status;

  const headers = getHeaders(sheet);
  const leadIdColumn = headers.indexOf('Lead ID') + 1;

  if (leadIdColumn === 0) {
    throw new Error('Sheet chưa có cột Lead ID.');
  }

  const rowIndex = findRowByLeadId(sheet, leadIdColumn, payload.leadId);
  if (!rowIndex) {
    sheet.appendRow(buildLeadRow(sheet, payload));
    return;
  }

  updateLeadRow(sheet, rowIndex, buildLeadRecord(payload));
}

function updateLeadRow(sheet, rowIndex, record) {
  const headers = getHeaders(sheet);

  Object.keys(record).forEach(function (header) {
    const value = record[header];
    const columnIndex = headers.indexOf(header) + 1;

    if (columnIndex > 0 && value !== '') {
      sheet.getRange(rowIndex, columnIndex).setValue(value);
    }
  });
}

function findRowByLeadId(sheet, leadIdColumn, leadId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  const values = sheet.getRange(2, leadIdColumn, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === leadId) {
      return i + 2;
    }
  }

  return 0;
}

function notifyTelegram(payload) {
  const lead = payload.lead || {};
  const roi = payload.roi || {};
  const survey = payload.survey || {};
  const message = [
    'Lead mới từ AgentRocket AI',
    '',
    'Trạng thái: qualified',
    'Thời gian: ' + (payload.submittedAt || ''),
    'Họ tên: ' + (lead.fullname || ''),
    'Doanh nghiệp: ' + (lead.company || ''),
    'Điện thoại: ' + (lead.phone || ''),
    'Email/Zalo: ' + (lead.email || ''),
    'Ngành: ' + (lead.industry || ''),
    'Quy mô: ' + (lead.size || ''),
    'Doanh thu: ' + (lead.revenue || ''),
    'Lead/tháng: ' + (lead.leads || ''),
    'Vấn đề: ' + (lead.pain || ''),
    '',
    'Khảo sát tùy chọn:',
    'Kênh lead chính: ' + (survey.leadChannel || ''),
    'Nơi lưu lead: ' + (survey.leadStorage || ''),
    'Tác vụ AI ưu tiên: ' + (survey.firstAiTask || ''),
    'Mức độ sẵn sàng: ' + (survey.readiness || ''),
    '',
    'ROI ròng ước tính: ' + (roi.netRoiEstimated || ''),
    'Lead ID: ' + (payload.leadId || ''),
    'URL: ' + (payload.pageUrl || '')
  ].join('\n');

  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    }),
    muteHttpExceptions: true
  });
}

function notifyTelegramError(error) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }

  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: 'Lỗi webhook AgentRocket AI: ' + error.message
    }),
    muteHttpExceptions: true
  });
}

function handlePaymentRequest(e) {
  const callback = e.parameter.callback || '';

  try {
    const action = e.parameter.action || '';
    const payload = parseAdminPayload(e.parameter.payload);

    if (action === 'create_pending_order') {
      return jsonpResponse({
        ok: true,
        data: createPendingPaymentOrder(payload)
      }, callback);
    }

    if (action === 'get_order_status') {
      return jsonpResponse({
        ok: true,
        data: getPaymentOrderStatus(payload)
      }, callback);
    }

    throw new Error('Action thanh toán không hợp lệ: ' + action);
  } catch (error) {
    return jsonpResponse({
      ok: false,
      error: error.message
    }, callback);
  }
}

function getPaymentOrderStatus(payload) {
  const orderId = sanitizePaymentId(payload.orderId);
  if (!orderId) {
    throw new Error('Thiếu mã đơn hàng.');
  }

  const sheet = getAdminSheet('orders');
  const rowIndex = findAdminRowById(sheet, orderId);
  if (!rowIndex) {
    return {
      orderId: orderId,
      status: 'not_found',
      paid: false
    };
  }

  const headers = getAdminHeaders(sheet);
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const record = rowToObject(headers, row);

  return {
    orderId: orderId,
    status: record.order_status || '',
    paid: record.order_status === 'paid',
    paidAt: record.paid_at || ''
  };
}

function createPendingPaymentOrder(payload) {
  const orderId = sanitizePaymentId(payload.orderId);
  if (!orderId) {
    throw new Error('Thiếu mã đơn hàng.');
  }

  const productCode = sanitizePaymentId(payload.productCode);
  const productConfig = PAYMENT_PRODUCTS[productCode];

  if (!productConfig) {
    throw new Error('Mã sản phẩm thanh toán không hợp lệ: ' + productCode);
  }

  const productName = productConfig.name;
  const productType = productConfig.productType;
  const amount = productConfig.amount;
  const customerPayload = payload.customer || {};
  const transferContent = payload.transferContent || '';

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const productId = upsertPaymentProduct(productCode, productName, productType, amount);
    const customerId = upsertPaymentCustomer(customerPayload);
    const orderSheet = getAdminSheet('orders');
    const existingRow = findAdminRowById(orderSheet, orderId);
    const record = {
      id: orderId,
      customer_id: customerId,
      product_id: productId,
      amount: amount,
      order_status: 'pending_payment',
      purchased_at: normalizeAdminDateTime(''),
      payment_content: transferContent,
      product_code: productCode,
      source_url: payload.pageUrl || '',
      paid_at: '',
      gateway: '',
      gateway_transaction_id: '',
      gateway_raw: ''
    };

    if (existingRow) {
      updateAdminRowWithoutOverwritingPaid(orderSheet, existingRow, record);
    } else {
      orderSheet.appendRow(buildAdminRow(orderSheet, record));
    }

    return {
      orderId: orderId,
      productId: productId,
      customerId: customerId,
      paymentContent: transferContent
    };
  } finally {
    lock.releaseLock();
  }
}

function upsertPaymentProduct(productCode, productName, productType, amount) {
  const productId = productCode || ('PAY' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss'));
  const sheet = getAdminSheet('products');
  const existingRow = findAdminRowById(sheet, productId);
  const record = {
    id: productId,
    name: productName,
    product_type: productType,
    price: amount,
    description: 'Tạo tự động từ trang thanh toán',
    stock_remaining: ''
  };

  if (existingRow) {
    updateAdminRow(sheet, existingRow, record);
  } else {
    sheet.appendRow(buildAdminRow(sheet, record));
  }

  return productId;
}

function upsertPaymentCustomer(customerPayload) {
  const leadId = sanitizePaymentId(customerPayload.leadId);
  const phone = customerPayload.phone || '';
  const customerId = leadId || sanitizePaymentId(phone) || ('C' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss'));
  const sheet = getAdminSheet('customers');
  const existingRow = findAdminRowById(sheet, customerId);
  const record = {
    id: customerId,
    name: customerPayload.name || 'Khách thanh toán',
    phone: phone,
    zalo: customerPayload.zalo || '',
    registered_at: normalizeAdminDateTime('')
  };

  if (existingRow) {
    record.registered_at = getExistingAdminCell(sheet, existingRow, 'registered_at') || record.registered_at;
    updateAdminRow(sheet, existingRow, record);
  } else {
    sheet.appendRow(buildAdminRow(sheet, record));
  }

  return customerId;
}

function getExistingAdminCell(sheet, rowIndex, header) {
  const headers = getAdminHeaders(sheet);
  const columnIndex = headers.indexOf(header) + 1;

  if (columnIndex <= 0) {
    return '';
  }

  return sheet.getRange(rowIndex, columnIndex).getValue();
}

function updateAdminRowWithoutOverwritingPaid(sheet, rowIndex, record) {
  const headers = getAdminHeaders(sheet);
  const statusColumn = headers.indexOf('order_status') + 1;
  const currentStatus = statusColumn > 0 ? sheet.getRange(rowIndex, statusColumn).getValue() : '';

  if (currentStatus === 'paid') {
    delete record.order_status;
    delete record.paid_at;
    delete record.gateway;
    delete record.gateway_transaction_id;
    delete record.gateway_raw;
  }

  updateAdminRow(sheet, rowIndex, record);
}

function handleSepayWebhook(e) {
  try {
    assertSepayConfigured(e);

    const payload = parseWebhookPayload(e);
    const result = markOrderPaidFromWebhook(payload);

    return jsonResponse({
      ok: true,
      data: result
    });
  } catch (error) {
    notifyTelegramError(error);

    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

function assertSepayConfigured(e) {
  if (!SEPAY_WEBHOOK_TOKEN) {
    throw new Error('Thiếu SEPAY_WEBHOOK_TOKEN trong Apps Script.');
  }

  if ((e.parameter.token || '') !== SEPAY_WEBHOOK_TOKEN) {
    throw new Error('Token SePay webhook không hợp lệ.');
  }
}

function parseWebhookPayload(e) {
  if (e && e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    try {
      return JSON.parse(contents);
    } catch (error) {
      return {
        raw: contents
      };
    }
  }

  return e.parameter || {};
}

function markOrderPaidFromWebhook(payload) {
  const content = extractWebhookContent(payload);
  const orderId = extractOrderIdFromContent(content);
  const amount = extractWebhookAmount(payload);
  const transactionId = extractWebhookTransactionId(payload);
  const paidAt = extractWebhookPaidAt(payload);

  if (!orderId) {
    throw new Error('Không tìm thấy mã đơn trong nội dung chuyển khoản: ' + content);
  }

  const sheet = getAdminSheet('orders');
  const rowIndex = findAdminRowById(sheet, orderId);

  if (!rowIndex) {
    throw new Error('Không tìm thấy đơn hàng ứng với mã: ' + orderId);
  }

  assertWebhookAmountMatches(sheet, rowIndex, amount);

  const record = {
    id: orderId,
    amount: amount || '',
    order_status: 'paid',
    payment_content: content,
    paid_at: paidAt,
    gateway: 'sepay',
    gateway_transaction_id: transactionId,
    gateway_raw: JSON.stringify(payload)
  };

  updateAdminRow(sheet, rowIndex, record);
  notifyTelegramPaymentPaid(orderId, amount, content);

  return {
    orderId: orderId,
    status: 'paid'
  };
}

function assertWebhookAmountMatches(sheet, rowIndex, paidAmount) {
  if (!paidAmount) {
    return;
  }

  const headers = getAdminHeaders(sheet);
  const amountColumn = headers.indexOf('amount') + 1;
  if (amountColumn === 0) {
    return;
  }

  const expectedAmount = Number(sheet.getRange(rowIndex, amountColumn).getValue() || 0);
  if (expectedAmount > 0 && Number(paidAmount) !== expectedAmount) {
    throw new Error('Số tiền SePay không khớp. Kỳ vọng ' + expectedAmount + ', nhận ' + paidAmount + '.');
  }
}

function extractWebhookContent(payload) {
  return String(
    payload.content ||
    payload.transfer_content ||
    payload.description ||
    payload.transaction_content ||
    payload.memo ||
    payload.raw ||
    ''
  );
}

function extractOrderIdFromContent(content) {
  const match = String(content || '').match(/\bO[0-9A-Za-z]{8,20}\b/);
  return match ? match[0] : '';
}

function extractWebhookAmount(payload) {
  return parseAdminNumber(
    payload.amount ||
    payload.transferAmount ||
    payload.transfer_amount ||
    payload.money ||
    payload.value ||
    ''
  );
}

function extractWebhookTransactionId(payload) {
  return String(
    payload.id ||
    payload.transaction_id ||
    payload.referenceCode ||
    payload.reference_code ||
    payload.code ||
    ''
  );
}

function extractWebhookPaidAt(payload) {
  return String(
    payload.transactionDate ||
    payload.transaction_date ||
    payload.created_at ||
    payload.time ||
    normalizeAdminDateTime('')
  );
}

function notifyTelegramPaymentPaid(orderId, amount, content) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }

  const message = [
    'Thanh toán mới từ SePay',
    '',
    'Mã đơn: ' + orderId,
    'Số tiền: ' + amount,
    'Nội dung: ' + content
  ].join('\n');

  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    }),
    muteHttpExceptions: true
  });
}

function sanitizePaymentId(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
}

function handleAdminRequest(e) {
  const callback = e.parameter.callback || '';

  try {
    assertAdminConfigured(e);

    const action = e.parameter.action || 'list_all';
    const resource = e.parameter.resource || '';
    const payload = parseAdminPayload(e.parameter.payload);

    if (action === 'list_all') {
      return jsonpResponse({
        ok: true,
        data: listAdminData()
      }, callback);
    }

    if (!ADMIN_RESOURCES[resource]) {
      throw new Error('Resource admin không hợp lệ: ' + resource);
    }

    if (action === 'create') {
      return jsonpResponse({
        ok: true,
        id: createAdminRecord(resource, payload)
      }, callback);
    }

    if (action === 'update') {
      updateAdminRecord(resource, payload);
      return jsonpResponse({ ok: true }, callback);
    }

    if (action === 'delete') {
      deleteAdminRecord(resource, payload.id);
      return jsonpResponse({ ok: true }, callback);
    }

    throw new Error('Action admin không hợp lệ: ' + action);
  } catch (error) {
    return jsonpResponse({
      ok: false,
      error: error.message
    }, callback);
  }
}

function assertAdminConfigured(e) {
  if (!SHEET_ID || SHEET_ID === '0') {
    throw new Error('Thiếu SHEET_ID Google Sheet thật cho admin.');
  }

  if (!ADMIN_TOKEN) {
    throw new Error('Thiếu ADMIN_TOKEN trong Apps Script.');
  }

  if ((e.parameter.token || '') !== ADMIN_TOKEN) {
    throw new Error('Token admin không hợp lệ.');
  }
}

function parseAdminPayload(payload) {
  if (!payload) {
    return {};
  }

  while (payload.length % 4) {
    payload += '=';
  }

  const bytes = Utilities.base64DecodeWebSafe(payload);
  const json = Utilities.newBlob(bytes).getDataAsString('UTF-8');
  return JSON.parse(json);
}

function listAdminData() {
  const products = getAdminRecords('products');
  const customers = getAdminRecords('customers');
  const orders = enrichAdminOrders(getAdminRecords('orders'), products, customers);

  return {
    products: products,
    customers: customers,
    orders: orders
  };
}

function enrichAdminOrders(orders, products, customers) {
  const productById = indexById(products);
  const customerById = indexById(customers);

  return orders.map(function (order) {
    const product = productById[String(order.product_id)] || {};
    const customer = customerById[String(order.customer_id)] || {};

    order.product_name = product.name || '';
    order.customer_name = customer.name || '';
    order.product_type = product.product_type || '';
    return order;
  });
}

function indexById(records) {
  return records.reduce(function (map, record) {
    map[String(record.id)] = record;
    return map;
  }, {});
}

function getAdminRecords(resource) {
  const sheet = getAdminSheet(resource);
  const headers = getAdminHeaders(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, headers.length)
    .getValues()
    .filter(function (row) {
      return row.some(function (value) {
        return value !== '';
      });
    })
    .map(function (row) {
      return rowToObject(headers, row);
    })
    .reverse();
}

function rowToObject(headers, row) {
  return headers.reduce(function (record, header, index) {
    record[header] = row[index];
    return record;
  }, {});
}

function getAdminSheet(resource) {
  const config = ADMIN_RESOURCES[resource];
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(config.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(config.sheetName);
  }

  ensureAdminHeaderRow(sheet, config.headers);
  return sheet;
}

function ensureAdminHeaderRow(sheet, requiredHeaders) {
  const lastColumn = sheet.getLastColumn();
  const existingHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    : [];
  const hasHeaders = existingHeaders.some(function (value) {
    return value !== '';
  });

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }

  const missingHeaders = requiredHeaders.filter(function (header) {
    return existingHeaders.indexOf(header) === -1;
  });

  if (missingHeaders.length > 0) {
    sheet
      .getRange(1, existingHeaders.length + 1, 1, missingHeaders.length)
      .setValues([missingHeaders]);
  }
}

function getAdminHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    return [];
  }

  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function createAdminRecord(resource, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const record = normalizeAdminRecord(resource, payload);
    record.id = record.id || generateAdminId(resource);

    if (resource === 'orders') {
      decrementPhysicalStock(record.product_id);
    }

    const sheet = getAdminSheet(resource);
    sheet.appendRow(buildAdminRow(sheet, record));
    return record.id;
  } finally {
    lock.releaseLock();
  }
}

function updateAdminRecord(resource, payload) {
  if (!payload.id) {
    throw new Error('Thiếu ID cần cập nhật.');
  }

  const record = normalizeAdminRecord(resource, payload);
  const sheet = getAdminSheet(resource);
  const rowIndex = findAdminRowById(sheet, payload.id);

  if (!rowIndex) {
    throw new Error('Không tìm thấy dòng ID: ' + payload.id);
  }

  updateAdminRow(sheet, rowIndex, record);
}

function deleteAdminRecord(resource, id) {
  if (!id) {
    throw new Error('Thiếu ID cần xóa.');
  }

  const sheet = getAdminSheet(resource);
  const rowIndex = findAdminRowById(sheet, id);

  if (!rowIndex) {
    throw new Error('Không tìm thấy dòng ID: ' + id);
  }

  sheet.deleteRow(rowIndex);
}

function normalizeAdminRecord(resource, payload) {
  if (resource === 'products') {
    return {
      id: payload.id || '',
      name: payload.name || '',
      product_type: payload.product_type || 'service',
      price: parseAdminNumber(payload.price),
      description: payload.description || '',
      stock_remaining: payload.stock_remaining === '' || payload.stock_remaining === null || payload.stock_remaining === undefined
        ? ''
        : parseAdminNumber(payload.stock_remaining)
    };
  }

  if (resource === 'customers') {
    return {
      id: payload.id || '',
      name: payload.name || '',
      phone: payload.phone || '',
      zalo: payload.zalo || '',
      registered_at: normalizeAdminDateTime(payload.registered_at)
    };
  }

  return {
    id: payload.id || '',
    customer_id: payload.customer_id || '',
    product_id: payload.product_id || '',
    amount: parseAdminNumber(payload.amount),
    order_status: payload.order_status || 'new',
    purchased_at: normalizeAdminDateTime(payload.purchased_at)
  };
}

function parseAdminNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  const cleaned = String(value).replace(/[^\d]/g, '');
  return Number(cleaned || 0);
}

function normalizeAdminDateTime(value) {
  if (!value) {
    return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm');
  }

  return String(value);
}

function buildAdminRow(sheet, record) {
  const headers = getAdminHeaders(sheet);
  return headers.map(function (header) {
    return record[header] !== undefined ? record[header] : '';
  });
}

function updateAdminRow(sheet, rowIndex, record) {
  const headers = getAdminHeaders(sheet);

  Object.keys(record).forEach(function (header) {
    const columnIndex = headers.indexOf(header) + 1;
    if (columnIndex > 0) {
      sheet.getRange(rowIndex, columnIndex).setValue(record[header]);
    }
  });
}

function findAdminRowById(sheet, id) {
  const headers = getAdminHeaders(sheet);
  const idColumn = headers.indexOf('id') + 1;
  const lastRow = sheet.getLastRow();

  if (idColumn === 0 || lastRow < 2) {
    return 0;
  }

  const values = sheet.getRange(2, idColumn, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      return i + 2;
    }
  }

  return 0;
}

function decrementPhysicalStock(productId) {
  if (!productId) {
    throw new Error('Thiếu sản phẩm cho đơn hàng.');
  }

  const sheet = getAdminSheet('products');
  const rowIndex = findAdminRowById(sheet, productId);

  if (!rowIndex) {
    throw new Error('Không tìm thấy sản phẩm: ' + productId);
  }

  const headers = getAdminHeaders(sheet);
  const typeColumn = headers.indexOf('product_type') + 1;
  const stockColumn = headers.indexOf('stock_remaining') + 1;
  const productType = sheet.getRange(rowIndex, typeColumn).getValue();

  if (productType !== 'physical') {
    return;
  }

  if (stockColumn === 0) {
    return;
  }

  const currentStock = sheet.getRange(rowIndex, stockColumn).getValue();
  if (currentStock !== '' && Number(currentStock) <= 0) {
    throw new Error('Sản phẩm vật lý đã hết tồn kho.');
  }

  if (currentStock !== '') {
    sheet.getRange(rowIndex, stockColumn).setValue(Number(currentStock) - 1);
  }
}

function generateAdminId(resource) {
  const prefix = {
    products: 'P',
    customers: 'C',
    orders: 'O'
  }[resource] || 'R';

  return prefix + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMddHHmmss') + Math.floor(Math.random() * 1000);
}

function jsonpResponse(data, callback) {
  if (!callback || !/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return jsonResponse(data);
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleMcpRequest(e) {
  try {
    assertMcpConfigured(e);

    const action = e.parameter.action || '';
    const payload = parseAdminPayload(e.parameter.payload);

    if (action === 'get_daily_business_summary') {
      return jsonResponse({
        ok: true,
        data: getMcpDailyBusinessSummary(payload)
      });
    }

    if (action === 'list_new_leads') {
      return jsonResponse({
        ok: true,
        data: listMcpNewLeads(payload)
      });
    }

    if (action === 'get_payment_and_order_status') {
      return jsonResponse({
        ok: true,
        data: getMcpPaymentAndOrderStatus(payload)
      });
    }

    throw new Error('Action MCP không hợp lệ: ' + action);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

function assertMcpConfigured(e) {
  if (!SHEET_ID || SHEET_ID === '0') {
    throw new Error('Thiếu SHEET_ID Google Sheet thật cho MCP.');
  }

  if (!SHEET_NAME) {
    throw new Error('Thiếu SHEET_NAME Google Sheet thật cho MCP.');
  }

  if (!ADMIN_TOKEN) {
    throw new Error('Thiếu ADMIN_TOKEN để bảo vệ MCP Apps Script action.');
  }

  if ((e.parameter.token || '') !== ADMIN_TOKEN) {
    throw new Error('Token MCP không hợp lệ.');
  }
}

function getMcpDailyBusinessSummary(payload) {
  const dateText = normalizeMcpDate(payload.date || mcpTodayText());
  const leads = filterMcpLeadsByDate(getMcpLeadRecords(), dateText, dateText, payload.status || 'all');
  const adminData = listAdminData();
  const orders = adminData.orders || [];
  const ordersOnDate = orders.filter(function (order) {
    return mcpDateTextFromValue(order.purchased_at) === dateText || mcpDateTextFromValue(order.paid_at) === dateText;
  });
  const statusCounts = countMcpByField(ordersOnDate, 'order_status');
  const paidOrders = ordersOnDate.filter(function (order) {
    return order.order_status === 'paid';
  });
  const pendingOrders = ordersOnDate.filter(function (order) {
    return order.order_status === 'pending_payment' || order.order_status === 'new';
  });
  const paidRevenue = paidOrders.reduce(function (sum, order) {
    return sum + parseAdminNumber(order.amount);
  }, 0);
  const attentionItems = [];

  leads.slice(0, 5).forEach(function (lead) {
    attentionItems.push({
      type: 'lead',
      message: 'Lead mới: ' + (lead.fullname || 'Không tên') + ' - ' + (lead.company || 'Chưa có doanh nghiệp'),
      lead_id: lead.lead_id
    });
  });

  pendingOrders.slice(0, 5).forEach(function (order) {
    attentionItems.push({
      type: 'order',
      message: 'Đơn cần theo dõi: ' + order.id + ' - ' + (order.customer_name || 'Khách chưa rõ') + ' - ' + formatMcpVnd(order.amount),
      order_id: order.id
    });
  });

  return {
    date: dateText,
    source: 'google_sheets',
    lead_count: leads.length,
    order_count: ordersOnDate.length,
    order_status_counts: statusCounts,
    paid_order_count: paidOrders.length,
    pending_order_count: pendingOrders.length,
    paid_revenue: paidRevenue,
    paid_revenue_text: formatMcpVnd(paidRevenue),
    attention_items: attentionItems.slice(0, 5)
  };
}

function listMcpNewLeads(payload) {
  const fromDate = normalizeMcpDate(payload.from_date || payload.date || mcpTodayText());
  const toDate = normalizeMcpDate(payload.to_date || payload.date || fromDate);
  const status = payload.status || 'all';
  const limit = normalizeMcpLimit(payload.limit, 10, 50);
  const leads = filterMcpLeadsByDate(getMcpLeadRecords(), fromDate, toDate, status);

  return {
    source: 'google_sheets',
    from_date: fromDate,
    to_date: toDate,
    status: status,
    total: leads.length,
    leads: leads.slice(0, limit)
  };
}

function getMcpPaymentAndOrderStatus(payload) {
  const orderId = payload.order_id ? String(payload.order_id).trim() : '';
  const status = payload.status || 'all';
  const limit = normalizeMcpLimit(payload.limit, 10, 50);
  const adminData = listAdminData();
  let orders = adminData.orders || [];

  if (orderId) {
    const found = orders.filter(function (order) {
      return String(order.id) === orderId;
    })[0];

    if (!found) {
      return {
        source: 'google_sheets',
        order_id: orderId,
        found: false,
        message: 'Không tìm thấy đơn hàng.'
      };
    }

    return {
      source: 'google_sheets',
      order_id: orderId,
      found: true,
      order: compactMcpOrder(found)
    };
  }

  if (status !== 'all') {
    orders = orders.filter(function (order) {
      return String(order.order_status || '') === status;
    });
  }

  const totalAmount = orders.reduce(function (sum, order) {
    return sum + parseAdminNumber(order.amount);
  }, 0);

  return {
    source: 'google_sheets',
    status: status,
    total: orders.length,
    total_amount: totalAmount,
    total_amount_text: formatMcpVnd(totalAmount),
    orders: orders.slice(0, limit).map(compactMcpOrder)
  };
}

function getMcpLeadRecords() {
  const sheet = getLeadSheet();
  ensureHeaderRow(sheet);
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, headers.length)
    .getValues()
    .filter(function (row) {
      return row.some(function (value) {
        return value !== '';
      });
    })
    .map(function (row) {
      const record = rowToObject(headers, row);
      return compactMcpLead(record);
    })
    .reverse();
}

function compactMcpLead(record) {
  return {
    lead_id: record['Lead ID'] || '',
    status: record['Trạng thái'] || '',
    submitted_at: record['Thời gian gửi'] || '',
    source: record['Nguồn'] || '',
    page_url: record['URL trang'] || '',
    fullname: record['Họ và tên'] || '',
    company: record['Doanh nghiệp'] || '',
    phone: record['Số điện thoại'] || '',
    email_or_zalo: record['Email hoặc Zalo'] || '',
    industry: record['Ngành'] || '',
    size: record['Quy mô'] || '',
    revenue: record['Doanh thu'] || '',
    leads_monthly: record['Lead mỗi tháng'] || '',
    pain: record['Vấn đề chính'] || '',
    roi_net: record['ROI - ROI ròng'] || '',
    lead_channel: record['Khảo sát - Kênh lead chính'] || '',
    lead_storage: record['Khảo sát - Nơi lưu lead'] || '',
    first_ai_task: record['Khảo sát - Tác vụ AI ưu tiên'] || '',
    readiness: record['Khảo sát - Mức độ sẵn sàng'] || ''
  };
}

function compactMcpOrder(order) {
  return {
    id: order.id || '',
    customer_id: order.customer_id || '',
    customer_name: order.customer_name || '',
    product_id: order.product_id || '',
    product_name: order.product_name || '',
    product_type: order.product_type || '',
    amount: parseAdminNumber(order.amount),
    amount_text: formatMcpVnd(order.amount),
    order_status: order.order_status || '',
    payment_content: order.payment_content || '',
    product_code: order.product_code || '',
    source_url: order.source_url || '',
    purchased_at: order.purchased_at || '',
    paid_at: order.paid_at || '',
    gateway: order.gateway || '',
    gateway_transaction_id: order.gateway_transaction_id || ''
  };
}

function filterMcpLeadsByDate(leads, fromDate, toDate, status) {
  return leads.filter(function (lead) {
    const leadDate = mcpDateTextFromValue(lead.submitted_at);
    const statusMatches = status === 'all' || String(lead.status || '') === status;
    return statusMatches && leadDate >= fromDate && leadDate <= toDate;
  });
}

function countMcpByField(records, field) {
  return records.reduce(function (result, record) {
    const key = record[field] || 'unknown';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function normalizeMcpDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Ngày phải có định dạng YYYY-MM-DD.');
  }
  return text;
}

function normalizeMcpLimit(value, fallback, maxValue) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(number), maxValue);
}

function mcpTodayText() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}

function mcpDateTextFromValue(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const viMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (viMatch) {
    return viMatch[3] + '-' + viMatch[2] + '-' + viMatch[1];
  }

  return '';
}

function formatMcpVnd(value) {
  return new Intl.NumberFormat('vi-VN').format(parseAdminNumber(value)) + 'đ';
}

const PAYMENT_SHEET_NAME = 'Payment';

const PAYMENT_COLUMNS = {
  bank: 'Ngân hàng',
  transactionDate: 'Ngày giao dịch',
  accountNumber: 'Số tài khoản',
  subAccount: 'Tài khoản phụ',
  paymentCode: 'Code TT',
  content: 'Nội dung thanh toán',
  type: 'Loại',
  amount: 'Số tiền',
  referenceId: 'Mã tham chiếu',
  balance: 'Lũy kế'
};

function syncPaymentsFromSheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const paymentSheet = spreadsheet.getSheetByName(PAYMENT_SHEET_NAME);

    if (!paymentSheet) {
      throw new Error('Không tìm thấy tab Payment.');
    }

    const headers = getHeaders(paymentSheet);
    const lastRow = paymentSheet.getLastRow();

    if (lastRow < 2) {
      return {
        ok: true,
        message: 'Chưa có giao dịch trong tab Payment.'
      };
    }

    ensurePaymentProcessedColumns(paymentSheet);

    const updatedHeaders = getHeaders(paymentSheet);
    const processedColumn = updatedHeaders.indexOf('Đã xử lý') + 1;
    const processedAtColumn = updatedHeaders.indexOf('Xử lý lúc') + 1;
    const resultColumn = updatedHeaders.indexOf('Kết quả xử lý') + 1;

    const values = paymentSheet
      .getRange(2, 1, lastRow - 1, updatedHeaders.length)
      .getValues();

    let paidCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    values.forEach(function (row, index) {
      const rowIndex = index + 2;
      const record = rowToObject(updatedHeaders, row);

      if (String(record['Đã xử lý'] || '').toLowerCase() === 'yes') {
        skippedCount++;
        return;
      }

      const content = String(record[PAYMENT_COLUMNS.content] || '');
      const paymentCode = String(record[PAYMENT_COLUMNS.paymentCode] || '');
      const combinedContent = [paymentCode, content].join(' ');
      const orderId = extractOrderIdFromContent(combinedContent);

      if (!orderId) {
        paymentSheet.getRange(rowIndex, resultColumn).setValue('Bỏ qua: không tìm thấy mã đơn O...');
        skippedCount++;
        return;
      }

      const amount = parseAdminNumber(record[PAYMENT_COLUMNS.amount]);
      const referenceId = String(record[PAYMENT_COLUMNS.referenceId] || '');
      const paidAt = String(record[PAYMENT_COLUMNS.transactionDate] || normalizeAdminDateTime(''));

      try {
        markOrderPaidFromPaymentSheet({
          orderId: orderId,
          amount: amount,
          content: content,
          paymentCode: paymentCode,
          referenceId: referenceId,
          paidAt: paidAt,
          raw: record
        });

        paymentSheet.getRange(rowIndex, processedColumn).setValue('yes');
        paymentSheet.getRange(rowIndex, processedAtColumn).setValue(normalizeAdminDateTime(''));
        paymentSheet.getRange(rowIndex, resultColumn).setValue('Đã cập nhật paid cho đơn ' + orderId);

        paidCount++;
      } catch (error) {
        paymentSheet.getRange(rowIndex, resultColumn).setValue('Lỗi: ' + error.message);
        errorCount++;
      }
    });

    return {
      ok: true,
      paidCount: paidCount,
      skippedCount: skippedCount,
      errorCount: errorCount
    };
  } finally {
    lock.releaseLock();
  }
}

function ensurePaymentProcessedColumns(sheet) {
  const headers = getHeaders(sheet);
  const requiredHeaders = ['Đã xử lý', 'Xử lý lúc', 'Kết quả xử lý'];
  const missingHeaders = requiredHeaders.filter(function (header) {
    return headers.indexOf(header) === -1;
  });

  if (missingHeaders.length > 0) {
    sheet
      .getRange(1, headers.length + 1, 1, missingHeaders.length)
      .setValues([missingHeaders]);
  }
}

function markOrderPaidFromPaymentSheet(payment) {
  const orderId = payment.orderId;
  const amount = payment.amount;
  const content = payment.content || '';
  const paymentCode = payment.paymentCode || '';
  const referenceId = payment.referenceId || '';
  const paidAt = payment.paidAt || normalizeAdminDateTime('');

  const sheet = getAdminSheet('orders');
  const rowIndex = findAdminRowById(sheet, orderId);

  if (!rowIndex) {
    throw new Error('Không tìm thấy đơn hàng ứng với mã: ' + orderId);
  }

  assertWebhookAmountMatches(sheet, rowIndex, amount);

  const record = {
    id: orderId,
    amount: amount || '',
    order_status: 'paid',
    payment_content: [paymentCode, content].join(' ').trim(),
    paid_at: paidAt,
    gateway: 'sepay_google_sheets',
    gateway_transaction_id: referenceId,
    gateway_raw: JSON.stringify(payment.raw || {})
  };

  updateAdminRow(sheet, rowIndex, record);
  notifyTelegramPaymentPaid(orderId, amount, record.payment_content);

  return {
    orderId: orderId,
    status: 'paid'
  };
}
