import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

dotenv.config();
const ZALO_ACCESS_TOKEN = process.env.ZALO_ACCESS_TOKEN;

async function sendUserInfoRequestV3(userId) {
    if (!ALLOWED_TESTERS.includes(userId)) {
        console.log(`[BLOCKED] Đã chặn gửi tin đến khách hàng lạ: ${userId}`);
        return; // Dừng ngay, không gửi gì cả
    }

    console.log(`[SAFE] Đang gửi mẫu xin thông tin cho Tester: ${userId}`);

    const url = 'https://openapi.zalo.me/v3.0/oa/message/cs';
    const payload = {
        recipient: { user_id: userId },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "request_user_info",
                    elements: [{
                        title: "TESTING BOT", // Ghi rõ là Test để lỡ có gửi nhầm khách cũng đỡ sợ
                        subtitle: "Đây là tin nhắn kiểm thử kỹ thuật, vui lòng bỏ qua.",
                        image_url: "https://f37-zfcloud.zdn.vn/62baec9351d5f18ba8c4/4075447654580633971"
                    }]
                }
            }
        }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: { 'access_token': ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' }
        });
        console.log('Kết quả gửi:', response.data);
    } catch (error) {
        console.error('Lỗi gửi tin:', error.message);
    }
}

// Endpoint nhận Webhook từ Zalo
app.post('/zalo-webhook', (req, res) => {
    const eventData = req.body;

    // Chỉ xử lý nếu có người gửi (sender)
    if (eventData.sender && eventData.sender.id) {
        const senderId = eventData.sender.id;

        // 2. CHỐT CHẶN AN TOÀN TẠI WEBHOOK
        // Nếu người tương tác KHÔNG PHẢI là bạn -> Bỏ qua luôn
        if (!ALLOWED_TESTERS.includes(senderId)) {
            // Vẫn trả về 200 để Zalo không báo lỗi, nhưng Server mình không làm gì cả
            return res.status(200).send('OK');
        }

        // --- XỬ LÝ SỰ KIỆN 1: NGƯỜI DÙNG CHAT KÍCH HOẠT ---
        // Nếu bạn chat chữ: "#test_info" thì bot mới gửi form
        if (eventData.event_name === 'user_send_text') {
            const userMessage = eventData.message.text;
            if (userMessage === '#test_info') {
                sendUserInfoRequestV3(senderId);
            }
        }

        // --- XỬ LÝ SỰ KIỆN 2: NGƯỜI DÙNG ĐÃ BẤM GỬI FORM ---
        if (eventData.event_name === 'user_submit_info') {
            console.log('>>> NHẬN DỮ LIỆU TEST THÀNH CÔNG:');
            console.log('Tên:', eventData.info.name);
            console.log('SĐT:', eventData.info.phone);
        }
    }

    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Webhook server đang chạy tại cổng ${PORT}`);
});