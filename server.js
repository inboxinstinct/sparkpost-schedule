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
  tempoProgress: { type: Number, default: 0 },
  inProgress: { type: Boolean, required: false, default: false },
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
      // Find campaigns that are scheduled, not yet sent, and not in progress
      const campaigns = await Campaign.find({
        scheduledAt: { $lte: new Date() },
        isScheduleSent: false,
        inProgress: false,
      });
  
      // Iterate over each campaign and send it via SparkPost
      for (const campaign of campaigns) {
        const { templateId, subject, fromName, fromEmail, htmlContent, recipientListId, campaignId, tempo, tempoRate } = campaign;
  
        const campaignIdStr = campaignId.toString();
  
        // Set the campaign as in progress
        campaign.inProgress = true;
        await campaign.save();
  
        try {
          // Retrieve the recipient list from SparkPost
          const recipientList = await sparkpost.recipientLists.get(recipientListId, {
            show_recipients: true,
          });
  
          const recipients = recipientList.results.recipients;
  
          if (!recipients || recipients.length === 0) {
            console.error(`No recipients found for recipient list ID: ${recipientListId}`);
            campaign.inProgress = false;
            await campaign.save();
            continue;
          }
  
          const formattedRecipients = recipients.map((recipient) => ({
            address: recipient.address,
          }));
  
          if (tempo && tempoRate) {
            // Calculate the number of batches based on the tempoRate
            const batchSize = tempoRate;
            const numBatches = Math.ceil(formattedRecipients.length / batchSize);
  
            // Send the campaign in batches
            for (let i = campaign.tempoProgress; i < numBatches; i++) {
              const startIndex = i * batchSize;
              const endIndex = Math.min(startIndex + batchSize, formattedRecipients.length);
              const batchRecipients = formattedRecipients.slice(startIndex, endIndex);
  
              // Send the campaign using SparkPost API for the current batch
              await sparkpost.transmissions.send({
                content: {
                  from: {
                    name: fromName,
                    email: fromEmail,
                  },
                  subject: subject,
                  html: htmlContent,
                },
                recipients: batchRecipients,
                campaign_id: campaignIdStr,
              });
  
              // Update the tempo progress
              campaign.tempoProgress = i + 1;
              await campaign.save();
  
              // Delay for 1 minute before sending the next batch
              if (i < numBatches - 1) {
                await new Promise((resolve) => setTimeout(resolve, 60000));
              }
            }
  
            // Mark the campaign as sent
            campaign.isScheduleSent = true;
          } else {
            // Send the campaign using SparkPost API for all recipients at once
            await sparkpost.transmissions.send({
              content: {
                from: {
                  name: fromName,
                  email: fromEmail,
                },
                subject: subject,
                html: htmlContent,
              },
              recipients: formattedRecipients,
              campaign_id: campaignIdStr,
            });
  
            // Update the campaign as sent
            campaign.isScheduleSent = true;
          }
        } catch (error) {
          console.error(`Error sending campaign ${campaign.campaignId}:`, error);
        } finally {
          // Mark the campaign as not in progress
          campaign.inProgress = false;
          await campaign.save();
        }
  
        console.log(`Campaign ${campaign.campaignId} sent successfully.`);
      }
    } catch (error) {
      console.error('Error sending scheduled campaigns:', error);
    }
  }
  



// Run the scheduled campaign sender every minute
setInterval(sendScheduledCampaigns, 60000);
