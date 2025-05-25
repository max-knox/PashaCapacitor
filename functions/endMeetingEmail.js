// endMeetingEmail.js
const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
const cors = require('cors')({
  origin: ['https://pa-sha.web.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

const transporter = nodemailer.createTransport({
  host: 'smtppro.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: 'info@nda-assistant.com',
    pass: 'HOR!211dev',
  },
});

exports.endMeetingEmail = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      const {
        meetingTitle,
        meetingDateTime,
        actionItems,
        summary,
        isSecondary
      } = req.body;

      // Validate required fields
      if (!meetingTitle || !meetingDateTime || !actionItems || !summary) {
        throw new Error('Missing required fields');
      }

      const actionItemsHtml = actionItems.map((item, index) => `
        <li style="margin-bottom: 10px;">
          <strong>Action Item ${index + 1}:</strong><br>
          <strong>What:</strong> ${item.what || 'N/A'}<br>
          <strong>Who:</strong> ${item.who || 'N/A'}<br>
          <strong>When:</strong> ${item.when || 'N/A'}<br>
          <strong>Status:</strong> ${item.status || 'N/A'}
        </li>
      `).join('');

      const emailBody = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              h1 { color: #2c3e50; }
              h2 { color: #34495e; }
              ul { padding-left: 20px; }
              .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; }
              .footer { font-size: 12px; color: #7f8c8d; margin-top: 20px; }
            </style>
          </head>
          <body>
            <h1>${meetingTitle}</h1>
            <h2>Meeting Date and Time: ${meetingDateTime}</h2>
            <h2>${isSecondary ? 'Secondary ' : ''}Action Items</h2>
            <ul>
              ${actionItemsHtml}
            </ul>
            <h2>${isSecondary ? 'Secondary ' : ''}Summary</h2>
            <div class="summary">
              <p>${summary}</p>
            </div>
            <div class="footer">
              <p>Updated: ${new Date().toLocaleString()}</p>
              <p>ENDPOINTS: endMeetingEmail</p>
              ${isSecondary ? '<p><strong>Note:</strong> This is a follow-up email with secondary processing results.</p>' : ''}
            </div>
          </body>
        </html>
      `;

      const mailOptions = {
        from: 'info@nda-assistant.com',
        to: ['systemsadmin@horizontesllc.com', 'mlaguna@horizontesllc.com'],
        subject: `${isSecondary ? 'Secondary ' : ''}Meeting Summary: ${meetingTitle}`,
        html: emailBody,
      };

      await transporter.sendMail(mailOptions);
      console.log(`${isSecondary ? 'Secondary ' : ''}Email sent successfully for meeting: ${meetingTitle}`);
      res.status(200).send('Email sent successfully');
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).send(`Error sending email: ${error.message}`);
    }
  });
});