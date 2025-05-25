// agent_completions.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { VertexAI } = require('@google-cloud/vertexai');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = require('./service-account-key.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.warn("Failed to initialize with service account, falling back to default credentials:", error);
    admin.initializeApp();
  }
}

const companyDirectory = [
  { name: "Steve Mikhov", aliases: ["Mr. Mikhov", "Steve"], role: "Boss", description: "oversees meetings, asks questions" },
  { name: "Jose Alba", aliases: ["Jose"], role: "General Manager", description: "leads meetings, provides updates, deals with vendors" },
  { name: "Jessica", aliases: [], role: "Personal Assistant", description: "handles scheduling" },
  { name: "Kate", aliases: [], role: "Personal Assistant", description: "takes notes, provides additional information" },
  { name: "", aliases: [], role: "Personal Assistant", description: "handles travel, experiences, food" },
  { name: "Max", aliases: [], role: "Software Engineer", description: "works on websites, web apps, AI assistants, building Pasha (personal assistant chatbot)" },
  { name: "Aryn", aliases: [], role: "Marketing Professional", description: "handles marketing campaigns, organizes expenses, invoices, issues payment methods" }
];

const db = admin.firestore();
const vertexAI = new VertexAI({project: 'pa-sha', location: 'us-central1'});

function findPersonInDirectory(name) {
  const normalizedName = name.toLowerCase();
  return companyDirectory.find(person => 
    person.name.toLowerCase() === normalizedName || 
    person.aliases.some(alias => alias.toLowerCase() === normalizedName)
  );
}

async function getOrCreateSession(sessionId) {
  const sessionRef = db.collection('sessions').doc(sessionId);
  const session = await sessionRef.get();
  if (!session.exists) {
    const initialContext = [];
    await sessionRef.set({ 
      context: initialContext,
      lastQuery: null,
      lastResponse: null,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp() 
    });
    return { context: initialContext, lastQuery: null, lastResponse: null };
  }
  return session.data();
}

async function updateSession(sessionId, newMessages, lastQuery, lastResponse) {
  const sessionRef = db.collection('sessions').doc(sessionId);
  const session = await sessionRef.get();
  let context = session.exists ? session.data().context : [];

  // Add new messages to context
  context = [...context, ...newMessages];

  // Keep only the last 10 messages to prevent the context from growing too large
  if (context.length > 10) {
    context = context.slice(-10);
  }

  await sessionRef.set({
    context: context,
    lastQuery: lastQuery,
    lastResponse: lastResponse,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function getActionItems(person) {
  const meetingsRef = db.collection('meetings');
  const meetings = [];
  const allNames = new Set();

  try {
    console.log(`Searching for action items for: ${person}`);
    const querySnapshot = await meetingsRef.get();

    if (querySnapshot.empty) {
      console.log('No documents found in the meetings collection');
      return { meetings: [], allNames: [] };
    }

    querySnapshot.forEach(doc => {
      const meetingData = doc.data();
      console.log(`Checking meeting: ${doc.id}, Data:`, JSON.stringify(meetingData));
      const relevantActionItems = [];

      if (meetingData.actionItems && Array.isArray(meetingData.actionItems)) {
        meetingData.actionItems.forEach((item, index) => {
          if (item.who) {
            const normalizedName = item.who.toLowerCase().replace(/^\*\*\s*/, '').trim();
            allNames.add(normalizedName);
            const directoryPerson = findPersonInDirectory(normalizedName);
            
            if (normalizedName === person.toLowerCase().trim() || 
                (directoryPerson && directoryPerson.name.toLowerCase() === person.toLowerCase())) {
              console.log(`Found action item for ${person}: ${JSON.stringify(item)}`);
              relevantActionItems.push({
                itemId: index,
                ...item,
                personInfo: directoryPerson
              });
            }
          }
        });
      }

      if (relevantActionItems.length > 0) {
        meetings.push({
          id: doc.id,
          title: meetingData.title || 'Untitled Meeting',
          date: meetingData.date,
          startTime: meetingData.startTime,
          endTime: meetingData.endTime,
          duration: meetingData.duration,
          summary: meetingData.summary || 'No summary available',
          actionItems: relevantActionItems
        });
      }
    });

    console.log(`Total meetings with action items found for ${person}: ${meetings.length}`);
    console.log('All names found:', Array.from(allNames));
    return { meetings, allNames: Array.from(allNames) };
  } catch (error) {
    console.error('Error getting action items:', error);
    throw new Error(`Failed to retrieve action items: ${error.message}`);
  }
}

async function getMeetingDetails(query) {
  const meetingsRef = db.collection('meetings');

  try {
    console.log(`Searching for meetings with query:`, JSON.stringify(query));
    let queryRef = meetingsRef;

    // If no specific query is provided, fetch all meetings
    const isEmptyQuery = !query.person && !query.date && !query.title;

    if (query.date) {
      queryRef = queryRef.where('date', '==', admin.firestore.Timestamp.fromDate(new Date(query.date)));
    }

    const querySnapshot = await queryRef.get();
    const meetings = [];

    if (querySnapshot.empty) {
      console.log('No meetings found in the database');
      return meetings;
    }

    querySnapshot.forEach(doc => {
      const meetingData = doc.data();
      console.log(`Checking meeting: ${doc.id}, Data:`, JSON.stringify(meetingData));

      const matchesPerson = query.person && (
        (meetingData.actionItems && meetingData.actionItems.some(item => {
          const itemPerson = findPersonInDirectory(item.who);
          return (itemPerson && (itemPerson.name.toLowerCase() === query.person.toLowerCase() || 
                                 itemPerson.aliases.some(alias => alias.toLowerCase() === query.person.toLowerCase()))) ||
                 (item.who && item.who.toLowerCase().includes(query.person.toLowerCase()));
        })) ||
        (meetingData.title && meetingData.title.toLowerCase().includes(query.person.toLowerCase())) ||
        (meetingData.summary && meetingData.summary.toLowerCase().includes(query.person.toLowerCase()))
      );

      if (isEmptyQuery || 
          matchesPerson ||
          (query.title && meetingData.title.toLowerCase().includes(query.title.toLowerCase())) ||
          query.date
      ) {
        // Enhance action items with person info
        if (meetingData.actionItems) {
          meetingData.actionItems = meetingData.actionItems.map(item => ({
            ...item,
            personInfo: findPersonInDirectory(item.who) || { name: item.who, role: "External", description: "Person not in company directory" }
          }));
        }

        meetings.push({
          id: doc.id,
          ...meetingData
        });
      }
    });

    console.log(`Total meetings found: ${meetings.length}`);
    return meetings;
  } catch (error) {
    console.error('Error getting meeting details:', error);
    throw new Error(`Failed to retrieve meeting details: ${error.message}`);
  }
}

function generateActionItemsResponse(meetings, person, allNames) {
  let textResponse = "";
  if (meetings && meetings.length > 0) {
    const personInfo = findPersonInDirectory(person);
    textResponse = `Here are the meetings with action items I found for ${person}${personInfo ? ` (${personInfo.role})` : ''}:\n\n`;
    meetings.forEach(meeting => {
      textResponse += `Meeting: ${meeting.title}.\n`;
      textResponse += `Date: ${meeting.date.toDate().toLocaleDateString()}.\n`;
      textResponse += `Time: ${meeting.startTime}.\n`;
      textResponse += `Action Items:\n`;
      meeting.actionItems.forEach(item => {
        textResponse += `  • ${item.what} (Due: ${item.when}, Status: ${item.status})\n`;
        if (item.personInfo) {
          textResponse += `    Assigned to: ${item.personInfo.name} (${item.personInfo.role})\n`;
        }
      });
      textResponse += `\n`;
    });
  } else {
    textResponse = `I couldn't find any meetings with action items for ${person}. `;
    if (allNames && allNames.length > 0) {
      textResponse += "However, I found these names in the database:\n";
      allNames.forEach(name => {
        const personInfo = findPersonInDirectory(name);
        textResponse += `- ${name}${personInfo ? ` (${personInfo.role})` : ''}\n`;
      });
      textResponse += "\nWould you like to check action items for any of these names?";
    } else {
      textResponse += "There are no action items or names in the database.";
    }
  }
  return { textResponse, meetings };
}

function generateMeetingDetailsResponse(meetings) {
  let textResponse = "";
  if (meetings && meetings.length > 0) {
    textResponse = `Here are the meetings I found:\n\n`;
    meetings.forEach((meeting, index) => {
      textResponse += `Meeting ${index + 1}: ${meeting.title}\n`;
      textResponse += `Date: ${meeting.date.toDate().toLocaleDateString()}\n`;
      textResponse += `Time: ${meeting.startTime}\n`;
      if (meeting.summary) {
        textResponse += `Summary: ${meeting.summary.substring(0, 100)}${meeting.summary.length > 100 ? '...' : ''}\n`;
      }
      if (meeting.actionItems && meeting.actionItems.length > 0) {
        textResponse += `Number of Action Items: ${meeting.actionItems.length}\n`;
      }
      textResponse += `\n`;
    });
    
    if (meetings.length > 5) {
      textResponse += `I've found ${meetings.length} meetings in total. I've shown the details for the first 5. Would you like more information about any specific meeting?\n`;
    }
  } else {
    textResponse = `I couldn't find any meetings in the database. It seems the database might be empty or there was an error retrieving the meetings.`;
  }
  return { textResponse, meetings };
}

exports.getChatCompletion = functions.https.onRequest(async (req, res) => {
  console.log('Function invoked with body:', JSON.stringify(req.body));

  const systemInstruction = `You are Pasha, an AI assistant capable of fetching meeting information and answering questions about anything. 
When discussing company meetings you can refer to the Company Directory for specific team members and roles.
When discussing meetings with vendors or other individuals outside the company, you can refer to individuals in meeting titles, action items or meeting summary.
Company Directory:
${companyDirectory.map(person => `- ${person.name} (${person.role}): ${person.description}`).join('\n')}

When it comes to company meetings, here are things that you can do:
- Find out action items for a specific person
- Get meeting details based on any person, date, meeting title
- Retrieve a list of all meetings in the database

When searching for people and assigning responsibility for action items:
- First, check the company directory to identify internal team members.
- If the person is not found in the company directory, search for them in meeting titles, action items, and summaries.
- For people outside the company directory, still attempt to find their meetings and action items.
- If an action is clearly for an outside vendor but the specific person is unknown, use "Supervised by: [Internal Team Member]" instead of "Who:".
- If you're unsure about who's responsible, make your best guess based on the information available.

Remember:
- Be concise in your responses unless asked for more detail
- Offer to elaborate on topics if it seems the user might want more information
- Be friendly and professional in your interactions
- If no exact name match is found in the company directory, still search for that name in meeting details
- Always try to be helpful and guide the user to the correct information
- Maintain context from previous messages in the conversation
- Do not respond with emojis or icons

Important: 
- When asked about a person not in the company directory, like Iris, still attempt to find meetings and action items for them by searching all available meeting information.
- When asked for a list of all meetings, retrieve all meetings from the database without applying any filters.`;

  try {
    const { prompt, sessionId } = req.body;

    if (!prompt || !sessionId) {
      console.log('Error: Missing prompt or sessionId');
      throw new Error('The function must be called with "prompt" and "sessionId" arguments.');
    }

    console.log('Calling Vertex AI with prompt:', prompt);

    const { context, lastQuery, lastResponse } = await getOrCreateSession(sessionId);

    // Include last query and response in the prompt if available
    let enhancedPrompt = prompt;
    if (lastQuery && lastResponse) {
      enhancedPrompt = `Previous question: "${lastQuery}"\nMy previous response: "${lastResponse}"\n\nNew question: "${prompt}"\n\nPlease consider the previous context when answering the new question.`;
    }

    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-pro-001',
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.9,
        topP: 0.95,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
      systemInstruction: {
        parts: [
          {text: systemInstruction},
        ],
      },
    });

    const functionDeclarations = [
      {
        name: "get_action_items",
        description: "Get action items for a specific person",
        parameters: {
          type: "object",
          properties: {
            person: {
              type: "string",
              description: "The name of the person to get action items for"
            }
          },
          required: ["person"]
        }
      },
      {
        name: "get_meeting_details",
        description: "Get meeting details based on person, date, or meeting title",
        parameters: {
          type: "object",
          properties: {
            person: {
              type: "string",
              description: "The name of a person involved in the meeting"
            },
            date: {
              type: "string",
              description: "The date of the meeting (format: YYYY-MM-DD)"
            },
            title: {
              type: "string",
              description: "Part of the meeting title"
            }
          }
        }
      }
    ];

    const contents = context.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] }));
    contents.push({ role: "user", parts: [{ text: enhancedPrompt }] });

    let result;
    try {
      result = await getChatCompletionWithRetry(generativeModel, contents, [{ function_declarations: functionDeclarations }]);
    } catch (retryError) {
      console.error('Error after retries:', retryError);
      throw retryError; // This will be caught by the outer try-catch
    }

    const response = result.response;
    console.log('Vertex AI response:', JSON.stringify(response));

    let botResponseText = '';
    let meetings = [];

    if (response.candidates[0].content.parts[0].functionCall) {
      const functionCall = response.candidates[0].content.parts[0].functionCall;
      let functionResult;

      try {
        switch (functionCall.name) {
          case "get_action_items":
            const actionItemsResult = await getActionItems(functionCall.args.person);
            functionResult = generateActionItemsResponse(actionItemsResult.meetings, functionCall.args.person, actionItemsResult.allNames);
            break;
          case "get_meeting_details":
            const meetingDetails = await getMeetingDetails(functionCall.args);
            functionResult = generateMeetingDetailsResponse(meetingDetails);
            break;
          default:
            throw new Error(`Unknown function: ${functionCall.name}`);
        }

        botResponseText = functionResult.textResponse;
        meetings = functionResult.meetings;
      } catch (error) {
        console.error(`Error executing function ${functionCall.name}:`, error);
        botResponseText = `I apologize, but I encountered an error while trying to retrieve the information: ${error.message}`;
      }
    } else {
      botResponseText = response.candidates[0].content.parts[0].text;
      
      // Check if the response confirms a name and fetch action items if so
      const confirmedName = extractConfirmedName(botResponseText);
      if (confirmedName) {
        const actionItemsResult = await getActionItems(confirmedName);
        const functionResult = generateActionItemsResponse(actionItemsResult.meetings, confirmedName, actionItemsResult.allNames);
        botResponseText += "\n\n" + functionResult.textResponse;
        meetings = functionResult.meetings;
      }
    }

    // Update the session with the new messages and last query/response
    await updateSession(sessionId, [
      { role: "user", content: prompt },
      { role: "assistant", content: botResponseText }
    ], prompt, botResponseText);

    res.status(200).json({
      response: {
        text: botResponseText,
        meetings: meetings
      }
    });

  } catch (error) {
    console.error('Error in getChatCompletion:', error);
    let errorMessage = 'An unexpected error occurred. Please try again later.';
    let statusCode = 500;

    if (error.message.includes('429 Too Many Requests')) {
      errorMessage = 'Rate limit exceeded. Please try again in a few moments.';
      statusCode = 429;
    } else if (error.message.includes('500 Internal Server Error')) {
      errorMessage = 'There was a temporary issue with the service. Please try again.';
      statusCode = 500;
    }

    // Log the full error details
    console.error('Detailed error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    res.status(statusCode).json({ error: errorMessage });
  }
});

async function getChatCompletionWithRetry(generativeModel, contents, tools, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  let delay = initialDelay;

  while (retries < maxRetries) {
    try {
      console.log(`Attempt ${retries + 1} to generate content`);
      const result = await generativeModel.generateContent({
        contents,
        tools,
      });
      console.log(`Content generated successfully on attempt ${retries + 1}`);
      return result;
    } catch (error) {
      console.error(`Error on attempt ${retries + 1}:`, error);
      if (retries < maxRetries - 1) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        delay *= 2; // Exponential backoff
      } else {
        console.error('Max retries reached. Throwing error.');
        throw error;
      }
    }
  }
}

function extractConfirmedName(text) {
  const patterns = [
    /You meant (\w+)/i,
    /Got it! You meant (\w+)/i,
    /Confirmed: (\w+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}