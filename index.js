require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { debug, Console } = require('node:console');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('query-string');

const redis = require('./configs/redis');
const { tokenCheck } = require('./middlewares/tokenCheck');
require('./utils/emailService'); // Adjust path as necessary

const app = express();

(async () => {
  try {
    await redis.connect();
    console.log('Connected to redis successfully');
  } catch (err) {
    console.error('Could not establish connection with redis:', err);
  }
})();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.options('*', cors());

app.use('/api/users', tokenCheck, require('./routes/api/users'));
app.use('/api/webinars', tokenCheck, require('./routes/api/webinars'));

const handleMeetingParticipantsReport = require('./routes/api/handleMeetingParticipantsReport'); // Adjust the path as necessary


const ZOOM_OAUTH_ENDPOINT = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2';


const getToken = async () => {
  try {
    const response = await axios.post(
      ZOOM_OAUTH_ENDPOINT,
      qs.stringify({
        grant_type: 'account_credentials',
        account_id: process.env.ZOOM_ACCOUNT_ID
      }), {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
      }
    });
    const { access_token } = response.data;
    await redis.set('access_token', access_token, 'EX', 3600); // Store token in Redis with an expiration
    return access_token;
  } catch (error) {
    console.error('Failed to get Zoom access token:', error);
    return null;
  }
};

// Webhook endpoint to handle incoming Zoom notifications
app.post('/webhook', async (req, res) => {
  res.send('webhook');
  console.log(req.headers);
  console.log(req.body);

  // construct the message string
  const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
  const hashForVerify = crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update(message).digest('hex');
  const signature = `v0=${hashForVerify}`;

  if (req.headers['x-zm-signature'] === signature) {
    try {
      if (req.body.event === 'endpoint.url_validation') {
        const hashForValidate = crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
          .update(req.body.payload.plainToken).digest('hex');

        res.status(200).json({
          plainToken: req.body.payload.plainToken,
          encryptedToken: hashForValidate
        });
      } else if (req.body.event === 'meeting.ended') {
        const meetingId = req.body.payload.object.id; // Extract meeting ID
        const meetingDetails = {
          duration: req.body.payload.object.duration,
          startTime: req.body.payload.object.start_time,
          endTime: req.body.payload.object.end_time,
          topic: req.body.payload.object.topic,
      }
      
      console.log('this is meeting id:' + meetingId);
      console.log('this is duration time:' + meetingDetails.duration);
      console.log('this is start time:' + meetingDetails.startTime);
      console.log('this is end time:' + meetingDetails.endTime);
      console.log('this is topic:' + meetingDetails.topic);



        const accessToken = await getToken(); // Fetch the access token

        if (!accessToken || !meetingId) {
          console.error('Failed to get access token or meeting ID');
          return res.status(500).send('Error fetching token or meeting ID');
        }

        // Call handleMeetingParticipantsReport and await its processing
        await handleMeetingParticipantsReport(meetingId, accessToken, meetingDetails);
        res.status(200).send('Webhook received and processed');
      }
    } catch (error) {
      console.error('Error in webhook handling:', error);
      if (!res.headersSent) {
        res.status(500).send('Server Error');
      }
    }
  } else {
    res.status(401).json({ message: 'Unauthorized request to Zoom Webhook sample.' });
  }
});

// async function handleMeetingEnd(meetingId, accessToken) {
//   console.log(`Handling ended meeting with ID: ${meetingId}`);
//   console.log(`Using Access Token: ${accessToken}`);

//   const headers = {
//     'Authorization': `Bearer ${accessToken}`, // Ensure the Bearer token is properly formatted
//     'Content-Type': 'application/json'
//   };

//   try {
//     const response = await axios.get(`${ZOOM_API_BASE_URL}/meetings/${meetingId}`, { headers });
//     console.log('Meeting details fetched successfully:', response.data);
//     return response.data;
//   } catch (error) {
//     console.error('Failed to fetch meeting details:', error.response ? error.response.data : error.message);
//     throw error; // Rethrow the error to handle it outside or log it
//   }
// }


const PORT = process.env.PORT || 5500;

const server = app.listen(PORT, () => console.log(`Listening on port ${[PORT]}!`));

const cleanup = async () => {
  debug('\nClosing HTTP server');
  await redis.del('access_token');
  server.close(() => {
    debug('\nHTTP server closed');
    redis.quit(() => process.exit());
  });
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);