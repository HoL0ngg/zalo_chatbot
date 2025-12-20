import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import qs from 'qs';

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

    if (hoursSinceUpdate > 23 || tokenData.accessToken === 'token_dummy' || !tokenData.accessToken) {
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
                        image_url: "https://f36-zfcloud.zdn.vn/beb8c57c502ef070a93f/1862497078564040680"
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

async function sendTextMessage(userId, textContent) {
    const accessToken = await getValidAccessToken(); // Tự động lấy token xịn
    const url = 'https://openapi.zalo.me/v3.0/oa/message/cs';

    const payload = {
        recipient: { user_id: userId },
        message: {
            text: textContent
        }
    };

    try {
        await axios.post(url, payload, {
            headers: { 'access_token': accessToken }
        });
    } catch (error) {
        console.error('❌ Lỗi gửi tin nhắn:', error.response ? error.response.data : error.message);
    }
}

// Endpoint nhận Webhook từ Zalo
app.post('/zalo-webhook', (req, res) => {
    const eventData = req.body;

    if (eventData.user_id_by_app) {
        const senderId = eventData.user_id_by_app;
        if (eventData.event_name === 'follow') {
            sendUserInfoRequestV3(senderId);
        }
        if (eventData.event_name === 'user_send_text') {
            const text = eventData.message.text;
            if (text.includes('Bạn đã gửi thông tin cho OA TOMAX HOLDING với nội dung:')) {
                sendUserInfoRequestV3(senderId, "Chúc mừng bạn đã đăng ký thành công chương trình thành viên TOMAX Holding.Theo dõi để đề cập thêm nhiều chương trình ưu đãi hấp dẫn từ từ TOMAX Holding nhé 💚");
            }
            // sendTextMessage(senderId, "Chúc mừng bạn đã đăng ký thành công chương trình thành viên TOMAX Holding. Theo dõi để đề cập thêm nhiều chương trình ưu đãi hấp dẫn từ từ TOMAX Holding nhé 💚");
        }
    }

    res.status(200).send('OK');
});

app.get('/zalo-callback', async (req, res) => {
    const { code, oa_id } = req.query;

    if (!code) {
        return res.status(400).send('❌ Không tìm thấy Authorization Code!');
    }

    console.log('🔄 Đang đổi Code lấy Token...');

    try {
        const response = await axios.post('https://oauth.zaloapp.com/v4/oa/access_token',
            qs.stringify({
                code: code,
                app_id: APP_ID,
                grant_type: 'authorization_code'
            }), {
            headers: {
                'secret_key': SECRET_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const data = response.data;

        if (data.access_token) {
            await TokenModel.findOneAndUpdate(
                { id: 'zalo_token_storage' },
                {
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    updatedAt: new Date()
                },
                { upsert: true, new: true }
            );

            res.send('<h1>🎉 Cấp quyền thành công! Bot đã sẵn sàng hoạt động.</h1>');
        } else {
            console.error('Lỗi đổi token:', data);
            res.status(500).send(`❌ Lỗi từ Zalo: ${JSON.stringify(data)}`);
        }

    } catch (error) {
        console.error('Lỗi kết nối:', error.message);
        res.status(500).send('❌ Lỗi Server nội bộ');
    }
});

app.listen(PORT, () => {
    console.log(`Webhook server đang chạy tại cổng ${PORT}`);
});