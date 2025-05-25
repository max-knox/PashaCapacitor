// completions_v2.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ 
  origin: '*', // Allow all origins (for testing ONLY)
  methods: ['POST'], 
  allowedHeaders: ['Content-Type']
}); 
const { Groq } = require('groq-sdk');

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

const db = admin.firestore();
const groq = new Groq({ apiKey: functions.config().groq.api_key });

const companyDirectory = [
  { name: "Steve Mikhov", aliases: ["Mr. Mikhov", "Steve"], role: "Boss", description: "oversees meetings, asks questions" },
  { name: "Jose Alba", aliases: ["Jose"], role: "General Manager", description: "leads meetings, provides updates, deals with vendors" },
  { name: "Jessica", aliases: [], role: "Personal Assistant", description: "handles scheduling" },
  { name: "Kate", aliases: [], role: "Personal Assistant", description: "takes notes, provides additional information" },
  { name: "Shawn", aliases: [], role: "Personal Assistant", description: "handles travel, experiences, food" },
  { name: "Max", aliases: [], role: "Software Engineer", description: "works on websites, web apps, AI assistants, building Pasha (personal assistant chatbot)" },
  { name: "Aryn", aliases: [], role: "Marketing Professional", description: "handles marketing campaigns, organizes expenses, invoices, issues payment methods" }
];

async function createFocusGroupDocument() {
  const db = admin.firestore();
  const timestamp = admin.firestore.Timestamp.now();
  const docRef = db.collection('assistant_docs').doc();
  
  await docRef.set({
    comment: `Assistant Document ${timestamp.toDate().toLocaleString()}`,
    createdAt: timestamp
  });

  return {
    documentId: docRef.id,
    message: 'Focus group document created successfully'
  };
}

async function getNDAFocusGroupQuestions() {
  const url = 'https://firebasestorage.googleapis.com/v0/b/pa-sha.appspot.com/o/focus_groups%2FNDA_questions%2Fquestions.txt?alt=media&token=d032d9f0-99d8-4004-beb0-f1bb346fd82b';
  
  try {
    const response = await fetch(url);
    const text = await response.text();
    return { questions: text };
  } catch (error) {
    console.error('Error fetching NDA Focus Group Questions:', error);
    throw error;
  }
}

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

  context = [...context, ...newMessages];

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
        (meetingData.summary && meetingData.summary.toLowerCase().includes(query.person.toLowerCase())) ||
        (meetingData.meetingHost && meetingData.meetingHost.toLowerCase() === query.person.toLowerCase()) ||
        (meetingData.meetingAttendees && meetingData.meetingAttendees.some(attendee => 
          attendee.toLowerCase() === query.person.toLowerCase()
        ))
      );

      if (isEmptyQuery || 
          matchesPerson ||
          (query.title && meetingData.title.toLowerCase().includes(query.title.toLowerCase())) ||
          query.date
      ) {
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
      if (meeting.meetingHost) {
        textResponse += `Host: ${meeting.meetingHost}\n`;
      }
      if (meeting.meetingAttendees && meeting.meetingAttendees.length > 0) {
        textResponse += `Attendees: ${meeting.meetingAttendees.join(', ')}\n`;
      }
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

function extractConfirmedName(text) {
  if (!text) return null;

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

exports.completions_v2 = functions.https.onRequest((req, res) => {
    cors(req, res, async () => { 
      console.log('Function invoked with body:', JSON.stringify(req.body));

      const systemInstruction = `You are "Pasha," a highly intelligent and versatile assistant with a genius-level intellect. You excel in technology, programming, reasoning, logic, mathematics, geography, history, ethics, law, and philanthropy. Your vast knowledge also encompasses art, movies, music, comedy, entertainment, and international affairs, allowing you to engage in insightful and meaningful conversations on virtually any topic.

      Your goal is to assist users with clarity and depth while maintaining a friendly and professional demeanor. You provide accurate, comprehensive, and thoughtful answers to all questions.
      
      When discussing company meetings, you can refer to the Company Directory for specific team members and roles. Here's the Company Directory:
      
      ${companyDirectory.map(person => `- ${person.name} (${person.role}): ${person.description}`).join('\n')}
      
      For company meetings and related queries, you can:
      
      - Get information on action items for a specific person
      - Get any meeting details
      - Retrieve a list of all meetings in the database
      - Create a new focus group document in the assistant_docs collection.
      - Retrieve NDA Focus Group Questions.
      
      Only use the provided tools when the user specifically asks about meetings, action items, people in the company directory, creating a focus group document, or accessing NDA Focus Group Questions. For all other queries, respond based on your general knowledge without calling any functions.
      
      **Guidelines:**
      
      - Provide information directly and professionally.
      - Use clear, precise, and respectful language.
      - Employ logical reasoning and insightful analysis.
      - Maintain a courteous and professional tone in all responses.
      - Focus on being informative and helpful.
      - Rely on your words for clarity without using emojis or icons.
      - Maintain context from previous messages in the conversation.
      
      **Important:**
      
      - When asked about a person not in the company directory, like Iris, attempt to find meetings and action items for them by searching all available meeting information. Comment professionally on the peculiarity of their absence from the directory.
      - When asked for a list of all meetings, retrieve all meetings from the database without applying any filters.
      - For questions unrelated to meetings, the company, focus group documents, or NDA questions, respond using your general knowledge without calling any functions.
      
      Above all, strive to make every interaction informative, insightful, and helpful. Your goal is to be the most knowledgeable and versatile AI assistant, providing accurate and comprehensive information to assist the user in any way possible.
      `;
  try {
    const { prompt, sessionId } = req.body;

    if (!prompt || !sessionId) {
      console.log('Error: Missing prompt or sessionId');
      throw new Error('The function must be called with "prompt" and "sessionId" arguments.');
    }

    console.log('Processing prompt:', prompt);

    const { context, lastQuery, lastResponse } = await getOrCreateSession(sessionId);

    let enhancedPrompt = prompt;
    if (lastQuery && lastResponse) {
      enhancedPrompt = `Previous question: "${lastQuery}"\nMy previous response: "${lastResponse}"\n\nNew question: "${prompt}"\n\nPlease consider the previous context when answering the new question.`;
    }

    const messages = [
      { role: "system", content: systemInstruction },
      ...context.map(msg => ({ role: msg.role, content: msg.content })),
      { role: "user", content: enhancedPrompt }
    ];

    const tools = [
      {
        type: "function",
        function: {
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
        }
      },
      {
        type: "function",
        function: {
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
      },
      {
        type: "function",
        function: {
          name: "get_nda_focus_group_questions",
          description: "Retrieve NDA Focus Group Questions",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function",
        function: {
          name: "create_focus_group_document",
          description: "Create a new focus group document",
          parameters: { type: "object", properties: {} }
        }
      }
    ];

    // For the first interaction or non-meeting related queries, don't use tools
    const shouldUseTool = context.length > 0 && (
      prompt.toLowerCase().includes('meeting') ||
      prompt.toLowerCase().includes('action item') ||
      companyDirectory.some(person => prompt.toLowerCase().includes(person.name.toLowerCase()))
    );

    let result;
    if (shouldUseTool) {
      try {
        result = await getChatCompletionWithRetry(messages, tools);
      } catch (retryError) {
        console.error('Error after retries:', retryError);
        throw retryError;
      }
    } else {
      try {
        result = await getChatCompletionWithRetry(messages, null);  // No tools
      } catch (retryError) {
        console.error('Error after retries:', retryError);
        throw retryError;
      }
    }

    console.log('Groq response:', JSON.stringify(result));

    let botResponseText = '';
    let meetings = [];

    if (result.choices && result.choices.length > 0 && result.choices[0].message) {
      if (shouldUseTool && result.choices[0].message.tool_calls) {
        const functionCall = result.choices[0].message.tool_calls[0].function;
        let functionResult;

        try {
          switch (functionCall.name) {
            case "get_action_items":
              const actionItemsResult = await getActionItems(JSON.parse(functionCall.arguments).person);
              functionResult = generateActionItemsResponse(actionItemsResult.meetings, JSON.parse(functionCall.arguments).person, actionItemsResult.allNames);
              break;
            case "get_meeting_details":
              const meetingDetails = await getMeetingDetails(JSON.parse(functionCall.arguments));
              functionResult = generateMeetingDetailsResponse(meetingDetails);
              break;
            case "create_focus_group_document":
              functionResult = await createFocusGroupDocument();
              break;
            case "get_nda_focus_group_questions":
              functionResult = await getNDAFocusGroupQuestions();
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
      } else if (result.choices[0].message.content) {
        botResponseText = result.choices[0].message.content;

        const confirmedName = extractConfirmedName(botResponseText);
        if (confirmedName) {
          const actionItemsResult = await getActionItems(confirmedName);
          const functionResult = generateActionItemsResponse(actionItemsResult.meetings, confirmedName, actionItemsResult.allNames);
          botResponseText += "\n\n" + functionResult.textResponse;
          meetings = functionResult.meetings;
        }
      } else {
        botResponseText = "I'm sorry, but I couldn't generate a proper response. Please try again.";
      }
    } else {
      botResponseText = "I'm sorry, but I received an unexpected response. Please try again.";
    }

    console.log('Final bot response:', botResponseText);

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
    console.error('Error in completions_v2:', error);
    let errorMessage = 'An unexpected error occurred. Please try again later.';
    let statusCode = 500;

    if (error.message.includes('429 Too Many Requests')) {
      errorMessage = 'Rate limit exceeded. Please try again in a few moments.';
      statusCode = 429;
    } else if (error.message.includes('500 Internal Server Error')) {
      errorMessage = 'There was a temporary issue with the service. Please try again.';
      statusCode = 500;
    }

    console.error('Detailed error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    res.status(statusCode).json({ error: errorMessage });
  }
  });
});

async function getChatCompletionWithRetry(messages, tools, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  let delay = initialDelay;

  while (retries < maxRetries) {
    try {
      console.log(`Attempt ${retries + 1} to generate content`);
      const completion = await groq.chat.completions.create({
        messages: messages,
        model: "llama3-groq-70b-8192-tool-use-preview",  // Change this to an available model
        temperature: 0.9,  
        max_tokens: 8192,
        top_p: 0.98, 
        ...(tools && { tools: tools }),
      });
      console.log(`Content generated successfully on attempt ${retries + 1}`);
      return completion;
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

module.exports = {
  completions_v2: exports.completions_v2
};