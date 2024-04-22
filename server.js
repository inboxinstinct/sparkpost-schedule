require('dotenv').config();
const mongoose = require('mongoose');
const SparkPost = require('sparkpost');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

// Create a SparkPost client
const sparkpost = new SparkPost(process.env.SPARKPOST_API_KEY);

// Define the campaign schema
const campaignSchema = new mongoose.Schema({
  campaignId: { type: Number, required: true, unique: true },
  subject: { type: String, required: true },
  fromName: { type: String, required: true },
  fromEmail: { type: String, required: true },
  htmlContent: { type: String, required: true },
  scheduledAt: { type: Date, required: false },
  templateId: { type: String, required: false },
  recipientListId: { type: String, required: false },
  isScheduleSent: { type: Boolean, required: false },
  tempo: { type: Boolean, required: false },
  tempoRate: { type: Number, required: false },
  stats: {
    opens: Number,
    clicks: Number,
    bounces: Number,
    successfulDeliveries: Number,
    unsubscribes: Number,
    spamComplaints: Number,
  },
  openers: [{ type: String, default: [] }],
  clickers: [{ type: String, default: [] }],
  bouncers: [
    {
      email: String,
      bounceCode: String,
    },
  ],
  delivered: [{ type: String, default: [] }],
  unsubscribed: [{ type: String, default: [] }],
  complaints: [{ type: String, default: [] }],
  createdAt: { type: Date, default: Date.now },
});

// Create a model based on the schema
const Campaign = mongoose.model('Campaign', campaignSchema);

// Function to send scheduled campaigns
async function sendScheduledCampaigns() {
  try {
    // Find campaigns that are scheduled and not yet sent
    const campaigns = await Campaign.find({
      scheduledAt: { $lte: new Date() },
      isScheduleSent: false,
    });

    // Iterate over each campaign and send it via SparkPost
    for (const campaign of campaigns) {
      const { templateId, subject, fromName, fromEmail, htmlContent, recipientListId, campaignId } = campaign;

      const campaignIdStr = campaignId.toString();

      // Send the campaign using SparkPost API
      await sparkpost.transmissions.send({
        /* content: {
            template_id: templateId,
        },  */  
        content: {
            from: {
              name: fromName,
              email: fromEmail,
            },
            subject: subject,
            html: htmlContent,
          },
        recipients: {
          list_id: recipientListId,
        },
        campaign_id: campaignIdStr,
      });

      // Update the campaign as sent
      campaign.isScheduleSent = true;
      await campaign.save();

      console.log(`Campaign ${campaign.campaignId} sent successfully.`);
    }
  } catch (error) {
    console.error('Error sending scheduled campaigns:', error);
  }
}

// Run the scheduled campaign sender every minute
setInterval(sendScheduledCampaigns, 60000);
