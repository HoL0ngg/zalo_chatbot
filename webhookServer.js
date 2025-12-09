import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

dotenv.config();
// const ZALO_ACCESS_TOKEN = process.env.ZALO_ACCESS_TOKEN;
const APP_ID = process.env.APP_ID;
const SECRET_KEY = process.env.SECRET_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Kết nối MongoDB thành công'))
    .catch(err => console.error('Lỗi kết nối MongoDB:', err));

const TokenSchema = new mongoose.Schema({
    id: { type: String, default: 'zalo_token_storage' }, // ID cố định
    accessToken: String,
    refreshToken: String,
    updatedAt: { type: Date, default: Date.now }
});
const TokenModel = mongoose.model('ZaloToken', TokenSchema);

app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>MyShop Backend</title>
        <meta name="zalo-platform-site-verification" content="Gy-X3vhz5XbGtvKLr-4O7175aolziqTqDZap" />
      </head>
      <body>
        <h1>Backend đang chạy!</h1>
        <p>API Ready.</p>
      </body>
    </html>
  `;
    res.send(html);
});

async function refreshAccessToken(refreshToken) {
    console.log('Đang tiến hành xin Token mới...');
    try {
        const response = await axios.post('https://oauth.zaloapp.com/v4/oa/access_token',
            qs.stringify({
                refresh_token: refreshToken,
                app_id: APP_ID,
                grant_type: 'refresh_token'
            }), {
            headers: { 'secret_key': SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.data.access_token) {
            return {
                at: response.data.access_token,
                rt: response.data.refresh_token // Zalo cấp RT mới luôn
            };
        } else {
            console.error('Lỗi Refresh Zalo:', response.data);
            return null;
        }
    } catch (e) {
        console.error('Lỗi gọi API Refresh:', e.message);
        return null;
    }
}

async function getValidAccessToken() {
    let tokenData = await TokenModel.findOne({ id: 'zalo_token_storage' });

    if (!tokenData) {
        tokenData = await TokenModel.create({
            accessToken: 'token_dummy', // Token tạm
            refreshToken: process.env.ZALO_REFRESH_TOKEN // Vốn ban đầu
        });
    }

    const hoursSinceUpdate = (new Date() - tokenData.updatedAt) / (1000 * 60 * 60);

    if (hoursSinceUpdate > 23 || !tokenData.accessToken) {
        console.log(`⏳ Token đã cũ (${hoursSinceUpdate.toFixed(1)}h), đang gia hạn...`);
        const newTokens = await refreshAccessToken(tokenData.refreshToken);

        if (newTokens) {
            tokenData.accessToken = newTokens.at;
            tokenData.refreshToken = newTokens.rt;
            tokenData.updatedAt = new Date();
            await tokenData.save();
            console.log('✅ Đã lưu Token mới vào DB!');
        }
    }

    return tokenData.accessToken;
}

async function sendUserInfoRequestV3(userId) {
    const accessToken = await getValidAccessToken();
    const url = 'https://openapi.zalo.me/v3.0/oa/message/cs';
    const payload = {
        recipient: { user_id: userId },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "request_user_info",
                    elements: [{
                        title: "Đăng ký thành viên",
                        subtitle: "Bạn ơi! Đăng ký thành viên và theo dõi trang Zalo OA của TOMAX Holding để luôn là người đầu tiên nhận thông tin ƯU ĐÃI và mua sắm nhanh chóng, tiện lợi hơn nha! 💚",
                        image_url: "https://f37-zfcloud.zdn.vn/62baec9351d5f18ba8c4/4075447654580633971"
                    }]
                }
            }
        }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: { 'access_token': accessToken, 'Content-Type': 'application/json' }
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
    if (eventData.user_id_by_app) {
        const senderId = eventData.user_id_by_app;
        if (eventData.event_name === 'follow') {
            sendUserInfoRequestV3(senderId);
        }
    }

    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Webhook server đang chạy tại cổng ${PORT}`);
});