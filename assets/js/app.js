/* ==========================================================================
   AgentRocket AI - Dynamic Logic & Conversion Tracking
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. ANALYTICS & EVENT TRACKING ENGINE
    // ==========================================
    const loggedEvents = new Set();

    function trackEvent(eventName, details = {}) {
        // Output log mimicking Google Tag Manager / Mixpanel style
        console.log(
            `%c[Analytics Log] Event: "${eventName}"`,
            'color: #0066cc; font-weight: bold; background: #e6f0fa; padding: 4px 8px; border-radius: 4px;',
            details
        );
        
        // Custom events dispatch for browser tests
        const event = new CustomEvent('agentrocket_tracking', { detail: { eventName, details } });
        window.dispatchEvent(event);
    }

    // Bind generic CTA buttons in header & hero
    document.querySelectorAll('.cta-button-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const eventName = btn.getAttribute('data-event-name') || 'click_audit_button';
            trackEvent(eventName, { 
                buttonText: btn.textContent.trim(),
                href: btn.getAttribute('href') 
            });
        });
    });

    // ==========================================
    // 2. MOBILE NAVIGATION MENU
    // ==========================================
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('nav-menu');

    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-xmark');
            }
        });

        // Close menu when clicking navigation link
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                const icon = menuToggle.querySelector('i');
                if (icon) {
                    icon.classList.add('fa-bars');
                    icon.classList.remove('fa-xmark');
                }
            });
        });
    }

    // Scroll auxiliary CTA "Xem Quy Trình Hoạt Động Mẫu" smoothly to Demo Flow
    const heroBtnDemo = document.getElementById('hero-btn-demo');
    if (heroBtnDemo) {
        heroBtnDemo.addEventListener('click', (e) => {
            e.preventDefault();
            trackEvent('click_demo_flow', { source: 'hero_secondary_button' });
            
            const demoFlowSection = document.getElementById('demo-flow');
            if (demoFlowSection) {
                demoFlowSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // ==========================================
    // 3. USE CASE SELECTOR (TABS)
    // ==========================================
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Log conversion event
            trackEvent(`use_case_tab_${targetTab}`, { tabName: btn.textContent.trim() });

            // Toggle active buttons
            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            // Toggle active contents
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            const activeContent = document.getElementById(`content-${targetTab}`);
            if (activeContent) {
                activeContent.classList.add('active');
            }
        });
    });

    // ==========================================
    // 4. INTERACTIVE ROI CALCULATOR
    // ==========================================
    // Sliders
    const rangeStaff = document.getElementById('range-staff');
    const rangeSalary = document.getElementById('range-salary');
    const rangeTime = document.getElementById('range-time');
    const rangeAutomation = document.getElementById('range-automation');
    const rangeLeads = document.getElementById('range-leads');
    const rangeConv = document.getElementById('range-conv');
    const rangeAov = document.getElementById('range-aov');

    // Values display elements
    const valStaff = document.getElementById('val-staff');
    const valSalary = document.getElementById('val-salary');
    const valTime = document.getElementById('val-time');
    const valAutomation = document.getElementById('val-automation');
    const valLeads = document.getElementById('val-leads');
    const valConv = document.getElementById('val-conv');
    const valAov = document.getElementById('val-aov');

    // Output elements
    const resSaving = document.getElementById('res-saving');
    const resRevenue = document.getElementById('res-revenue');
    const resNetRoi = document.getElementById('res-net-roi');

    function formatVND(num) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num).replace('₫', 'đ');
    }

    // Throttled ROI tracking variable
    let roiTrackTimeout;

    function calculateROI() {
        // Parse inputs
        const staff = parseInt(rangeStaff.value) || 0;
        const salary = parseInt(rangeSalary.value) || 0;
        const timePercent = parseInt(rangeTime.value) || 0;
        const automationPercent = parseInt(rangeAutomation.value) || 0;
        const leads = parseInt(rangeLeads.value) || 0;
        const convRate = parseFloat(rangeConv.value) || 0;
        const aov = parseInt(rangeAov.value) || 0;

        // Apply sliders text display
        valStaff.textContent = `${staff} người`;
        valSalary.textContent = formatVND(salary);
        valTime.textContent = `${timePercent}%`;
        valAutomation.textContent = `${automationPercent}%`;
        valLeads.textContent = `${leads.toLocaleString('vi-VN')} lead`;
        valConv.textContent = `${convRate}%`;
        valAov.textContent = formatVND(aov);

        // 1. Chi phí nhân sự tương đương được tối ưu/tháng
        const saving = staff * salary * (timePercent / 100) * (automationPercent / 100);

        // 2. Doanh thu tăng thêm ước tính/tháng (Cải thiện tương đối 15% trên tỷ lệ chốt)
        const revenue = leads * (convRate / 100) * 0.15 * aov;

        // 3. Chi phí vận hành AI (Cố định cơ bản giả lập)
        const aiCost = 1500000;

        // 4. ROI ròng ước tính/tháng
        const netRoi = saving + revenue - aiCost;

        // Display results
        resSaving.textContent = formatVND(Math.round(saving));
        resRevenue.textContent = formatVND(Math.round(revenue));
        resNetRoi.textContent = formatVND(Math.round(netRoi));

        // Color coding for final net ROI
        if (netRoi > 0) {
            resNetRoi.className = 'result-val highlight text-green';
        } else if (netRoi === 0) {
            resNetRoi.className = 'result-val highlight text-blue';
        } else {
            resNetRoi.className = 'result-val highlight text-red';
        }

        // Throttle tracking of calculator interaction
        clearTimeout(roiTrackTimeout);
        roiTrackTimeout = setTimeout(() => {
            trackEvent('roi_result_viewed', {
                saving: Math.round(saving),
                revenue: Math.round(revenue),
                netRoi: Math.round(netRoi)
            });
        }, 1000);
    }

    const sliders = [rangeStaff, rangeSalary, rangeTime, rangeAutomation, rangeLeads, rangeConv, rangeAov];
    sliders.forEach(slider => {
        if (slider) {
            slider.addEventListener('input', () => {
                calculateROI();
                // Record the slide event
                if (!loggedEvents.has('roi_slider_changed')) {
                    trackEvent('roi_slider_changed', { sliderId: slider.id });
                    loggedEvents.add('roi_slider_changed');
                }
            });
        }
    });

    // Run initial calculations
    if (rangeStaff) {
        calculateROI();
    }

    // ==========================================
    // 5. FAQ ACCORDION
    // ==========================================
    const faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const faqItem = question.parentElement;
            const faqAnswer = faqItem.querySelector('.faq-answer');

            // Close other items if open
            document.querySelectorAll('.faq-item').forEach(item => {
                if (item !== faqItem && item.classList.contains('active')) {
                    item.classList.remove('active');
                    item.querySelector('.faq-answer').style.maxHeight = null;
                }
            });

            // Toggle current item
            faqItem.classList.toggle('active');
            if (faqItem.classList.contains('active')) {
                faqAnswer.style.maxHeight = faqAnswer.scrollHeight + "px";
                trackEvent('faq_opened', { questionText: question.textContent.trim() });
            } else {
                faqAnswer.style.maxHeight = null;
            }
        });
    });

    // ==========================================
    // 6. LEAD REGISTRATION FORM & QUALIFICATION
    // ==========================================
    const leadForm = document.getElementById('leadForm');
    const formSuccess = document.getElementById('formSuccess');
    const btnCloseSuccess = document.getElementById('btn-close-success');
    const nextStepButton = document.getElementById('btn-next-step');
    const nextStepTwoButton = document.getElementById('btn-next-step-2');
    const prevStepButton = document.getElementById('btn-prev-step');
    const prevStepThreeButton = document.getElementById('btn-prev-step-3');
    const submitButton = document.getElementById('btn-submit-form');
    const leadWebhookUrl = window.AGENTROCKET_LEAD_WEBHOOK_URL;
    const formSteps = document.querySelectorAll('[data-form-step]');
    const stepIndicatorContainer = document.querySelector('.form-step-indicator');
    const stepIndicators = document.querySelectorAll('[data-step-indicator]');
    const stepOneFields = document.querySelectorAll('[data-step-field="1"]');
    const stepTwoFields = document.querySelectorAll('[data-step-field="2"]');
    const stepThreeFields = document.querySelectorAll('[data-step-field="3"]');
    const allStepFields = document.querySelectorAll('[data-step-field]');
    let currentLeadId = '';

    function createLeadId() {
        const randomPart = Math.random().toString(36).slice(2, 10);
        return `lead_${Date.now()}_${randomPart}`;
    }

    function getROIInputsSnapshot() {
        if (!rangeStaff) {
            return null;
        }

        return {
            staff: rangeStaff.value,
            salary: rangeSalary.value,
            repetitiveTimePercent: rangeTime.value,
            automationPercent: rangeAutomation.value,
            leadsMonthly: rangeLeads.value,
            conversionRate: rangeConv.value,
            averageOrderValue: rangeAov.value,
            savingEstimated: resSaving.textContent,
            revenueEstimated: resRevenue.textContent,
            netRoiEstimated: resNetRoi.textContent
        };
    }

    async function submitLeadToWebhook(payload) {
        if (!leadWebhookUrl) {
            throw new Error('Thiếu AGENTROCKET_LEAD_WEBHOOK_URL trong lead-config.js');
        }

        await fetch(leadWebhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });
    }

    async function sendLeadNotificationEmail(payload) {
        const response = await fetch('/.netlify/functions/lead-notify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Không gửi được email thông báo lead.');
        }

        return response.json();
    }

    function collectFormData(form) {
        const formData = new FormData(form);
        const dataObject = {};
        formData.forEach((value, key) => {
            dataObject[key] = value;
        });
        return dataObject;
    }

    function validateFields(fields) {
        const phoneInput = document.getElementById('phone');
        const emailOrZaloInput = document.getElementById('email');

        if (phoneInput) {
            phoneInput.setCustomValidity('');
            if (Array.from(fields).includes(phoneInput) && !isValidVietnamPhone(phoneInput.value)) {
                phoneInput.setCustomValidity('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
            }
        }

        if (emailOrZaloInput) {
            emailOrZaloInput.setCustomValidity('');
            if (Array.from(fields).includes(emailOrZaloInput) && !isValidEmailOrZaloContact(emailOrZaloInput.value)) {
                emailOrZaloInput.setCustomValidity('Vui lòng nhập email hợp lệ hoặc số Zalo/số điện thoại hợp lệ.');
            }
        }

        for (const field of fields) {
            if (!field.checkValidity()) {
                field.reportValidity();
                return false;
            }
        }

        return true;
    }

    function normalizePhone(value) {
        return value.trim().replace(/[\s().-]/g, '');
    }

    function isValidVietnamPhone(value) {
        const phone = normalizePhone(value);

        if (/^0[3-9][0-9]{8,9}$/.test(phone)) {
            return true;
        }

        if (/^\+84[3-9][0-9]{8,9}$/.test(phone)) {
            return true;
        }

        return /^84[3-9][0-9]{8,9}$/.test(phone);
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
    }

    function isValidEmailOrZaloContact(value) {
        const trimmed = value.trim();

        if (trimmed.includes('@')) {
            return isValidEmail(trimmed);
        }

        return isValidVietnamPhone(trimmed);
    }

    function setFieldsDisabled(fields, disabled) {
        fields.forEach(field => {
            field.disabled = disabled;
        });
    }

    function showFormStep(stepNumber) {
        formSteps.forEach(step => {
            const isActive = step.getAttribute('data-form-step') === String(stepNumber);
            step.classList.toggle('active', isActive);
            step.hidden = !isActive;
        });

        stepIndicators.forEach(indicator => {
            const isActive = indicator.getAttribute('data-step-indicator') === String(stepNumber);
            indicator.classList.toggle('active', isActive);
            indicator.hidden = !isActive;
        });

        if (stepIndicatorContainer) {
            stepIndicatorContainer.classList.toggle('hidden', stepNumber === 1);
            stepIndicatorContainer.hidden = stepNumber === 1;
        }

        allStepFields.forEach(field => {
            field.disabled = field.getAttribute('data-step-field') !== String(stepNumber);
        });
    }

    if (leadForm) {
        showFormStep(1);

        // Track when user starts typing in the form
        leadForm.querySelectorAll('.form-control').forEach(input => {
            input.addEventListener('focus', () => {
                if (!loggedEvents.has('form_started')) {
                    trackEvent('form_started', { firstInputFocused: input.name });
                    loggedEvents.add('form_started');
                }
            });
        });

        const phoneInput = document.getElementById('phone');
        const emailOrZaloInput = document.getElementById('email');

        if (phoneInput) {
            phoneInput.addEventListener('input', () => {
                phoneInput.setCustomValidity('');
            });
        }

        if (emailOrZaloInput) {
            emailOrZaloInput.addEventListener('input', () => {
                emailOrZaloInput.setCustomValidity('');
            });
        }

        if (nextStepButton) {
            nextStepButton.addEventListener('click', () => {
                if (!validateFields(stepOneFields)) {
                    return;
                }

                if (!currentLeadId) {
                    currentLeadId = createLeadId();
                }

                trackEvent('lead_step_1_completed', { leadId: currentLeadId });
                showFormStep(2);
            });
        }

        if (prevStepButton) {
            prevStepButton.addEventListener('click', () => {
                showFormStep(1);
            });
        }

        if (nextStepTwoButton) {
            nextStepTwoButton.addEventListener('click', () => {
                if (!validateFields(stepTwoFields)) {
                    return;
                }

                trackEvent('lead_step_2_completed', { leadId: currentLeadId });
                showFormStep(3);
            });
        }

        if (prevStepThreeButton) {
            prevStepThreeButton.addEventListener('click', () => {
                showFormStep(2);
            });
        }

        leadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const activeStep = document.querySelector('[data-form-step].active');
            if (activeStep && activeStep.getAttribute('data-form-step') === '1') {
                if (nextStepButton) {
                    nextStepButton.click();
                }
                return;
            }

            if (activeStep && activeStep.getAttribute('data-form-step') === '2') {
                if (nextStepTwoButton) {
                    nextStepTwoButton.click();
                }
                return;
            }

            if (!validateFields(stepTwoFields)) {
                return;
            }

            setFieldsDisabled(allStepFields, false);
            const dataObject = collectFormData(leadForm);
            const submittedAt = new Date().toISOString();
            const leadId = currentLeadId || createLeadId();
            const surveyData = {
                leadChannel: dataObject.leadChannel || '',
                leadStorage: dataObject.leadStorage || '',
                firstAiTask: dataObject.firstAiTask || '',
                readiness: dataObject.readiness || ''
            };
            const payload = {
                action: 'lead_submit',
                leadId,
                submittedAt,
                source: 'agentrocket_landing_page',
                pageUrl: window.location.href,
                userAgent: navigator.userAgent,
                lead: dataObject,
                survey: surveyData,
                roi: getROIInputsSnapshot()
            };

            // Log conversion submit event
            trackEvent('form_submitted', {
                companyName: dataObject.company,
                industry: dataObject.industry,
                leadsMonthly: dataObject.leads,
                size: dataObject.size,
                revenue: dataObject.revenue,
                painPoint: dataObject.pain
            });

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Đang gửi thông tin...';
            }

            try {
                await submitLeadToWebhook(payload);
                sendLeadNotificationEmail(payload)
                    .then((result) => {
                        trackEvent('lead_email_sent', {
                            leadId,
                            emailId: result.id
                        });
                    })
                    .catch((error) => {
                        console.error('[Lead Email Error]', error);
                        trackEvent('lead_email_failed', {
                            leadId,
                            message: error.message
                        });
                    });
                currentLeadId = leadId;
                trackEvent('lead_webhook_sent', {
                    leadId,
                    submittedAt,
                    companyName: dataObject.company
                });

                // Display submission success overlay
                if (formSuccess) {
                    formSuccess.classList.add('active');
                }
            } catch (error) {
                console.error('[Lead Webhook Error]', error);
                alert('Chưa gửi được thông tin. Vui lòng kiểm tra cấu hình webhook hoặc thử lại sau.');
                trackEvent('lead_webhook_failed', {
                    message: error.message
                });
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Gửi yêu cầu đăng ký';
                }
                showFormStep(3);
            }
        });
    }

    if (btnCloseSuccess && formSuccess && leadForm) {
        btnCloseSuccess.addEventListener('click', () => {
            formSuccess.classList.remove('active');
            leadForm.reset();
            currentLeadId = '';
            showFormStep(1);
            // Reset tracking state
            loggedEvents.delete('form_started');
            if (rangeStaff) {
                calculateROI(); // Reset sliders visuals in outputs
            }
        });
    }

    // ==========================================
    // 7. SALES CHATBOT WIDGET
    // ==========================================
    const chatbotToggle = document.getElementById('chatbot-toggle');
    const chatbotPanel = document.getElementById('chatbot-panel');
    const chatbotClose = document.getElementById('chatbot-close');
    const chatbotMessages = document.getElementById('chatbot-messages');
    const chatbotForm = document.getElementById('chatbot-form');
    const chatbotInput = document.getElementById('chatbot-input');
    const chatbotFormLink = document.getElementById('chatbot-form-link');
    let chatbotHasGreeted = false;

    const chatbotGreeting = 'Chào anh/chị, em là trợ lý của AgentRocket AI.\n\nThật ra mình không bắt đầu bằng chuyện “mua một con bot”. Mình bắt đầu bằng flow bán hàng thật của doanh nghiệp: lead đến từ đâu, ai xử lý, dữ liệu lưu ở đâu, và lúc nào cần follow-up.\n\nDoanh nghiệp mình hiện nhận lead chủ yếu từ kênh nào ạ: Zalo, Facebook, website, quảng cáo, hotline hay nguồn khác?';

    const chatbotReplies = [
        {
            keywords: ['làm gì', 'agentrocket', 'dịch vụ', 'sản phẩm', 'bên bạn làm gì'],
            answer: 'AgentRocket AI giúp chủ SME tự xây hệ thống AI Agent đầu tiên cho lead, sales và follow-up.\n\nNói đơn giản thôi: mình cùng vẽ lại quy trình đang chạy, rồi dựng một flow nhỏ nhưng dùng được. AI có thể nhận lead, hỏi thông tin, phân loại, lưu vào Sheets/CRM và nhắc sales xử lý tiếp.\n\nĐiểm quan trọng là anh/chị hiểu hệ thống đang chạy thế nào và sau này tự quản lý được.'
        },
        {
            keywords: ['crm', 'getfly', 'kiotviet', 'hubspot', 'pancake', 'phần mềm'],
            answer: 'AgentRocket AI không phải CRM. Nếu doanh nghiệp đang dùng Getfly, KiotViet, HubSpot, Pancake hoặc Google Sheets thì càng tốt.\n\nMình sẽ xem dữ liệu đang nằm ở đâu, sales đang xử lý bước nào, rồi thiết kế flow AI Agent kết nối hoặc bổ trợ cho hệ thống đó. Mình không bắt anh/chị bỏ công cụ đang dùng nếu công cụ đó vẫn phù hợp.'
        },
        {
            keywords: ['thay sales', 'thay nhân viên', 'sales', 'nhân viên'],
            answer: 'Không nên hiểu AI là để thay sales.\n\nAI xử lý phần đầu vào và việc lặp lại: phản hồi nhanh, hỏi thông tin cơ bản, lưu lead, phân loại sơ bộ và nhắc follow-up. Sales vẫn là người tư vấn sâu, xây niềm tin và chốt các ca cần con người.\n\nFlow tốt là flow biết lúc nào AI làm, lúc nào chuyển cho sales.'
        },
        {
            keywords: ['trả lời sai', 'ảo giác', 'bịa', 'hứa bừa', 'guardrail', 'guardrails'],
            answer: 'Nếu làm không có ranh giới thì có rủi ro. Vì vậy AgentRocket AI luôn thiết kế điểm kiểm soát trước.\n\nAI chỉ nên trả lời trong phần tri thức đã duyệt. Nếu khách hỏi ngoài tài liệu, báo giá đặc biệt, khiếu nại hoặc vấn đề cần tư vấn sâu, AI sẽ xin thông tin và chuyển cho người phụ trách.\n\nThật ra phần quan trọng không chỉ là “AI thông minh”, mà là flow có giới hạn rõ.'
        },
        {
            keywords: ['google sheets', 'sheet', 'sheets', 'excel'],
            answer: 'Có thể bắt đầu bằng Google Sheets.\n\nVới flow đầu tiên, Google Sheets thường là đủ nếu mục tiêu là lưu lead tập trung, phân loại và nhắc follow-up. Khi quy trình rõ hơn, anh/chị có thể nâng cấp sang CRM sau.\n\nKhông cần phức tạp ngay từ đầu. Mình cần một hệ thống vừa đủ chạy được trước.'
        },
        {
            keywords: ['giá', 'bao nhiêu', 'chi phí', 'phí', 'gói'],
            answer: 'Buổi RÀ SOÁT FLOW AI AGENT ĐẦU TIÊN trên website hiện không yêu cầu thanh toán.\n\nCòn giá triển khai thì em chưa nên báo cứng khi mình chưa nhìn flow thật. Nó phụ thuộc vào kênh lead, công cụ đang dùng, dữ liệu đã sẵn chưa và mức độ cần kết nối với Sheets/CRM.\n\nCách đúng hơn là anh/chị điền form trước. Đội ngũ sẽ xem thông tin, rà flow và đề xuất phạm vi phù hợp. Như vậy mình không bị neo vào một con số khi chưa biết bài toán thật.',
            showFormLink: true
        },
        {
            keywords: ['chatgpt', 'tự làm', 'tự dùng', 'cho rẻ'],
            answer: 'Dùng ChatGPT để viết nội dung hoặc hỏi đáp từng việc thì được.\n\nNhưng vấn đề của sales thường không nằm ở một câu trả lời. Nó nằm ở flow: lead vào từ đâu, AI hỏi gì, dữ liệu lưu chỗ nào, ai follow-up, lúc nào chuyển người thật.\n\nAgentRocket AI giúp anh/chị dựng phần đó thành hệ thống. Nhỏ thôi, nhưng có nền.'
        },
        {
            keywords: ['bao lâu', 'thời gian', 'mấy tuần', 'triển khai'],
            answer: 'Website đang mô tả lộ trình mẫu 4 tuần.\n\nTuần 1 vẽ lại flow bán hàng thật. Tuần 2 thiết kế logic AI Agent. Tuần 3 xây flow đầu tiên chạy được. Tuần 4 tinh chỉnh và chuyển giao để đội của anh/chị tự quản lý.\n\nThời gian thật còn tùy dữ liệu và tốc độ phản hồi hai bên, nhưng hướng đi là như vậy: từng bước, rõ ràng, không làm một hệ thống quá to ngay từ đầu.'
        },
        {
            keywords: ['case', 'feedback', 'khách hàng', 'đã làm cho ai', 'lời khen'],
            answer: 'Hiện em chưa có case study công khai đã được xác nhận trong dữ liệu.\n\nEm không muốn lấy ví dụ giả rồi nói như thật. Cách chắc hơn là mình nhìn vào flow hiện tại của doanh nghiệp anh/chị: lead đang đến từ đâu, đang bị chậm ở bước nào, dữ liệu có bị rải rác không, follow-up có bị quên không.\n\nNếu cần case tương tự ngành, đội ngũ có thể kiểm tra và chỉ chia sẻ phần được phép công khai.'
        },
        {
            keywords: ['mua', 'đăng ký', 'tư vấn', 'audit', 'bắt đầu', 'muốn xử lý', 'liên hệ', 'chốt'],
            answer: 'Nghe như doanh nghiệp mình đã có vấn đề khá rõ ở phần lead và follow-up rồi.\n\nEm nghĩ bước hợp lý nhất không phải là mua ngay. Mình nên rà soát flow trước: lead đến từ kênh nào, ai đang xử lý, dữ liệu lưu ở đâu, và điểm nào đang làm sales mất thời gian.\n\nBuổi RÀ SOÁT FLOW AI AGENT ĐẦU TIÊN kéo dài khoảng 45 phút và hiện không yêu cầu thanh toán. Anh/chị điền form danh sách chờ nhé, đội ngũ sẽ xem trước và hẹn lịch phù hợp.',
            showFormLink: true
        },
        {
            keywords: ['chưa sẵn sàng', 'tìm hiểu', 'bàn lại', 'chưa mua', 'suy nghĩ', 'để sau'],
            answer: 'Dạ được ạ. Mình không cần quyết định mua ngay.\n\nThật ra buổi audit sinh ra cho đúng giai đoạn này: anh/chị đang muốn hiểu xem doanh nghiệp có nên dùng AI Agent không, nên bắt đầu từ đâu, và cần chuẩn bị gì.\n\nForm chỉ hỏi các thông tin cơ bản như ngành, quy mô, số lead mỗi tháng, vấn đề chính và kênh nhận lead hiện tại. Điền xong đội ngũ sẽ xem trước để buổi nói chuyện đi thẳng vào việc của mình hơn.',
            showFormLink: true
        }
    ];

    function addChatbotMessage(text, sender = 'bot') {
        if (!chatbotMessages) return;
        const message = document.createElement('div');
        message.className = `chatbot-message ${sender}`;
        message.textContent = text;
        chatbotMessages.appendChild(message);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    function getChatbotReply(rawText) {
        const text = rawText.toLowerCase();
        return chatbotReplies.find(item => item.keywords.some(keyword => text.includes(keyword)));
    }

    function respondToChatbotPrompt(prompt) {
        const cleanPrompt = (prompt || '').trim();
        if (!cleanPrompt) return;

        try {
            addChatbotMessage(cleanPrompt, 'user');
            const reply = getChatbotReply(cleanPrompt) || {
                answer: 'Em hiểu. Để trả lời cho đúng, mình kéo về flow thật trước nhé: lead của anh/chị đang đến từ kênh nào, ai đang xử lý, dữ liệu đang lưu ở đâu và phần nào đang bị chậm nhất?\n\nNếu anh/chị muốn, mình có thể bắt đầu bằng buổi rà soát 45 phút để nhìn rõ flow trước khi quyết định triển khai.',
                showFormLink: true
            };

            window.setTimeout(() => {
                addChatbotMessage(reply.answer, 'bot');
                if (reply.showFormLink && chatbotFormLink) {
                    chatbotFormLink.hidden = false;
                }
            }, 240);
        } catch (error) {
            console.error('[Sales Chatbot Error]', error);
            addChatbotMessage('Em đang gặp lỗi nhỏ ở khung chat. Anh/chị có thể kéo xuống form RÀ SOÁT FLOW AI AGENT ĐẦU TIÊN để đội ngũ xem flow và liên hệ lại nhé.', 'bot');
            if (chatbotFormLink) {
                chatbotFormLink.hidden = false;
            }
        }
    }

    function openChatbot() {
        if (!chatbotPanel || !chatbotToggle) return;
        chatbotPanel.hidden = false;
        chatbotToggle.setAttribute('aria-expanded', 'true');
        if (!chatbotHasGreeted) {
            addChatbotMessage(chatbotGreeting, 'bot');
            chatbotHasGreeted = true;
            trackEvent('chatbot_opened', { source: 'floating_widget' });
        }
        if (chatbotInput) {
            window.setTimeout(() => chatbotInput.focus(), 80);
        }
    }

    function closeChatbot() {
        if (!chatbotPanel || !chatbotToggle) return;
        chatbotPanel.hidden = true;
        chatbotToggle.setAttribute('aria-expanded', 'false');
    }

    if (chatbotToggle && chatbotPanel) {
        chatbotToggle.addEventListener('click', () => {
            if (chatbotPanel.hidden) {
                openChatbot();
            } else {
                closeChatbot();
            }
        });
    }

    if (chatbotClose) {
        chatbotClose.addEventListener('click', closeChatbot);
    }

    if (chatbotForm && chatbotInput) {
        chatbotForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const prompt = chatbotInput.value.trim();
            chatbotInput.value = '';
            respondToChatbotPrompt(prompt);
        });

        chatbotInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            const prompt = chatbotInput.value.trim();
            chatbotInput.value = '';
            respondToChatbotPrompt(prompt);
        });
    }

    document.querySelectorAll('[data-chatbot-prompt]').forEach(button => {
        button.addEventListener('click', () => {
            respondToChatbotPrompt(button.getAttribute('data-chatbot-prompt') || '');
        });
    });

    if (chatbotFormLink) {
        chatbotFormLink.addEventListener('click', () => {
            trackEvent('chatbot_waitlist_click', { target: '#audit-form' });
            closeChatbot();
        });
    }});
