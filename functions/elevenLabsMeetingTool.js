const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * ElevenLabs Meeting Manager Tool Call Handler
 * This endpoint receives tool calls from ElevenLabs and manages meeting data in Firestore
 */
exports.elevenLabsMeetingTool = functions.https.onRequest(async (req, res) => {
  // Log incoming request for debugging
  console.log('ElevenLabs Meeting Tool Call:', {
    method: req.method,
    headers: req.headers,
    body: req.body
  });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, value, itemId, itemStatus } = req.body;

    // Find the active meeting
    const meetingsSnapshot = await db.collection('meetingCapture')
      .where('active', '==', true)
      .orderBy('startTime', 'desc')
      .limit(1)
      .get();

    if (meetingsSnapshot.empty) {
      return res.status(404).json({ 
        success: false, 
        message: 'No active meeting found.' 
      });
    }

    const meetingDoc = meetingsSnapshot.docs[0];
    const meetingId = meetingDoc.id;
    const meetingRef = db.collection('meetingCapture').doc(meetingId);

    console.log(`Processing action '${action}' for meeting: ${meetingId}`);

    // Parse the value parameter based on the action type
    let parsedValue = value;
    
    switch (action) {
      case 'updateTitle':
      case 'setDescription':
      case 'setPurpose':
      case 'addMember':
      case 'setSummary':
        // These actions expect a string value, so no parsing needed
        parsedValue = value;
        break;
        
      case 'addActionItem':
      case 'addDeliverable':
        // These actions expect an object, so try to parse the JSON string
        try {
          parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
        } catch (e) {
          // If parsing fails, treat it as a simple text value
          parsedValue = { text: value };
        }
        break;
        
      case 'setFollowUp':
        // This action expects a boolean
        parsedValue = value === 'true' || value === true;
        break;
    }

    let output = { success: false, message: 'Unknown action.' };

    switch (action) {
      case 'updateTitle':
        await meetingRef.update({ title: parsedValue });
        output = { success: true, message: `Meeting title updated to: ${parsedValue}.` };
        break;
        
      case 'setDescription':
        await meetingRef.update({ description: parsedValue });
        output = { success: true, message: 'Meeting description updated.' };
        break;
        
      case 'setPurpose':
        await meetingRef.update({ purpose: parsedValue });
        output = { success: true, message: 'Meeting purpose updated.' };
        break;
        
      case 'addMember':
        await meetingRef.update({
          members: admin.firestore.FieldValue.arrayUnion(parsedValue)
        });
        output = { success: true, message: `Member '${parsedValue}' added.` };
        break;
        
      case 'addActionItem':
        if (typeof parsedValue === 'object' && parsedValue.text) {
          const newItem = {
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            text: parsedValue.text,
            status: parsedValue.status || 'pending',
            assignedTo: parsedValue.assignedTo || '',
            dueDate: parsedValue.dueDate || null,
            createdAt: admin.firestore.Timestamp.now()
          };
          await meetingRef.update({
            actionItems: admin.firestore.FieldValue.arrayUnion(newItem)
          });
          output = { success: true, message: `Action item '${newItem.text}' added.` };
        } else {
          output.message = 'Invalid value for addActionItem. Expects a JSON object with at least a text property.';
        }
        break;
        
      case 'addDeliverable':
        if (typeof parsedValue === 'object' && parsedValue.text) {
          const newDeliverable = {
            id: `deliv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            text: parsedValue.text,
            status: parsedValue.status || 'pending',
            notes: parsedValue.notes || '',
            createdAt: admin.firestore.Timestamp.now()
          };
          await meetingRef.update({
            deliverables: admin.firestore.FieldValue.arrayUnion(newDeliverable)
          });
          output = { success: true, message: `Deliverable '${newDeliverable.text}' added.` };
        } else {
          output.message = 'Invalid value for addDeliverable. Expects a JSON object with at least a text property.';
        }
        break;
        
      case 'updateActionItemStatus':
      case 'updateDeliverableStatus':
        if (typeof itemId === 'string' && typeof itemStatus === 'string') {
          const arrayName = action === 'updateActionItemStatus' ? 'actionItems' : 'deliverables';
          
          // Use a transaction to update the specific item in the array
          await db.runTransaction(async (transaction) => {
            const meetingDoc = await transaction.get(meetingRef);
            if (!meetingDoc.exists) {
              throw new Error("Meeting document does not exist!");
            }

            const items = meetingDoc.data()[arrayName] || [];
            const itemIndex = items.findIndex(item => item.id === itemId);

            if (itemIndex === -1) {
              throw new Error(`Item with ID '${itemId}' not found in ${arrayName}.`);
            }

            items[itemIndex].status = itemStatus;
            items[itemIndex].updatedAt = admin.firestore.Timestamp.now();
            
            transaction.update(meetingRef, { [arrayName]: items });
          });
          
          output = { 
            success: true, 
            message: `${arrayName.slice(0, -1)} '${itemId}' status updated to '${itemStatus}'.` 
          };
        } else {
          output.message = 'Invalid parameters for updating item status. Requires itemId and itemStatus.';
        }
        break;
        
      case 'setSummary':
        await meetingRef.update({ summary: parsedValue });
        output = { success: true, message: 'Meeting summary updated.' };
        break;
        
      case 'setFollowUp':
        await meetingRef.update({ isFollowUp: parsedValue });
        output = { success: true, message: `Meeting follow-up status set to: ${parsedValue}.` };
        break;
        
      case 'getMeetingInfo':
        // Special action to retrieve current meeting information
        const meetingData = meetingDoc.data();
        output = {
          success: true,
          data: {
            title: meetingData.title,
            description: meetingData.description || '',
            purpose: meetingData.purpose || '',
            members: meetingData.members || [],
            actionItems: meetingData.actionItems || [],
            deliverables: meetingData.deliverables || [],
            summary: meetingData.summary || '',
            isFollowUp: meetingData.isFollowUp || false,
            startTime: meetingData.startTime.toDate().toISOString()
          }
        };
        break;
        
      default:
        output.message = `Unknown action: ${action}.`;
        break;
    }

    console.log('Tool call response:', output);
    return res.status(200).json(output);

  } catch (error) {
    console.error('Error handling ElevenLabs meeting tool call:', error);
    return res.status(500).json({
      success: false,
      message: `Error processing action: ${error.message}`
    });
  }
});
