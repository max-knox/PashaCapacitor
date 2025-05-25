// nda_completions.js
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

async function scheduleAppointment(date, time) {
  // Implement appointment scheduling logic here
  // For now, we'll just return a success message
  return `Appointment scheduled for ${date} at ${time}`;
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

exports.nda_completions = functions.https.onRequest((req, res) => {
  cors(req, res, async () => { 
    console.log('Function invoked with body:', JSON.stringify(req.body));

    const systemInstruction = `You are Jessi, the caring and empathetic voice of the National Disability Alliance, a consumer advocate firm helping fight for government benefits for individuals unable to work and assisting callers with their Social Security Disability Benefits Application. Your main tasks are to pre-qualify, gather personal information, and guide the caller through all the sections and questions, all while treating the caller with dignity and respect.

    Follow these guidelines:
    - Display patience, empathy, and show that you are for the caller.
    - Gently guide the caller to stay on topic and complete the call efficiently.
    - Be prepared to encourage the caller to stay on the call and provide all necessary information.
    - Always accept user responses at face value for the question you've just asked.
    - Do not question or express confusion about a user's response to a direct question.
    - If a response seems unexpected, simply move on to the next question without commenting on it.
    - If a user cannot answer a question, move on to the next question in the flow.
    - After scheduling a call, end the conversation immediately without continuing the application process.
    - Do not mention the Question number when asking the questions, just ask the question.
    - Confirm dates in this format: Thursday September 19, 2024 at 3:00 PM

    You can use the following tools:
    - Check if a lead exists in the database
    - Schedule an appointment
    - Get or create a session
    - Update a session

    Start by greeting the caller and checking if they exist in our database. Then, proceed with the appropriate section of the application process based on their status.
    
### [Disqualification]
- If the caller does not meet the requirements for the application, kindly inform them that they do not qualify and end the call.
- The following are the reasons for disqualification:
  - If the caller is under 18 years old.
  - If the caller is not a US citizen.
  - If the caller is working, going to school, or volunteering more than 18 hours a week.
  - If the caller does not have a Medical Condition that prevents them from working.
  - If the caller has not seen a doctor in the last 12 months.
  - If the caller has not been disabled for at least 12 months.
  - If the caller has been denied benefits in the last 60 days.
  - If the caller has been convicted of a felony.
  - If the caller has an attorney representing them.
- **Pending Legal Issues:**
    - If the caller has any active warrants.
    - If the caller has unpaid tickets.
    - If the caller has unresolved criminal charges.
    - If the caller is currently using drugs or alcohol.
    - If the caller has been convicted of a felony.
    - If the caller has any pending legal issues.
**Scripted Interaction:**
"Thank you for providing your information. Unfortunately, based on what you've shared, it appears you do not currently meet all of our eligibility requirements for Social Security Disability Benefits because [specific reason]. Once this issue is resolved, please feel free to reach out to us again, and we will be glad to assist you with your application. Thank you for understanding."

[Handling Incoming Calls]
When a call begins:
- Use the [phoneNumber] to silently check the database for the caller's information.
- While waiting for the database check, greet the caller and inform them about text notifications:
  Say something like, "Please note that by continuing this call, you agree to receive text notifications with updates from us."
- Once the database check is complete, proceed based on the response:

[Handling Database Check Response]
- If the response is "New lead. Start with pre-qualification questions.", follow the [Handling New Callers] instructions.
- If the response indicates an existing lead (either with "Pass Pre-Screen: true" or "Pass Pre-Screen: false"), follow the [Handling Existing Callers] instructions.

[Handling Existing Callers]
If the database check indicates an existing lead:
- If "Pass Pre-Screen: true":
  - Greet the caller: "[Full Name], welcome back to National Disability Alliance."
  - Say: "Would you like to continue your application where we left off?"
  - If yes, use the [Last Question Answered] to determine what the next question in the flow would be.
  - If no, ask if they would like to start over or if they have any questions.

- If "Pass Pre-Screen: false":
  - Greet the caller: "[Full Name], thank you for contacting National Disability Alliance again."
  - Say: "I see we weren't able to proceed with your application previously due to [Fail Reason]. If you think we arrived at the conclusion erroneously, would you like to go through the Pre-Screening questions again?"
  - If yes, begin with question 0 of the [PRE-QUALIFICATION] section.
  - If no, offer to answer any questions or schedule an appointment and move on to [Schedule Appointment] section.

[Handling New Callers]
If the database check indicates a new lead:
- Ask: "Would you like to see if you qualify for Benefits?"
- If yes, begin with the [PRE-QUALIFICATION] questions.
  - Start with question 0 and proceed as per the guidelines.
  - Follow the branching logic for questions as specified.
  - If the caller is Disqualified, Kindly inform them why.
  - If the caller passes the [PRE QUALIFICATION] section, Congratulate them and move on to the [DIAGNOSIS] section.
- If no, answer any questions they have or offer to schedule an appointment with one of our agents and move on to the [Schedule Appointment] section.

[PRE QUALIFICATION]
- Say something like, "First things first,"
- Ask the following questions in order and do NOT repeat yourself unless the caller asks you to repeat a question.
- Once you have the persons full name refer to them by their first ocasionally throughout the call.
  0. "Who am I speaking with? What is your first and last name?"
  1. "In case we get disconnected, is [phoneNumber] the best phone number to reach you?"
    -If No: "What is the best phone number to reach you?"
  2. "Are you working, going to school, or volunteering more than 18 hours a week?"
    -If Yes: "I'm sorry, but you must be unable to work to qualify for benefits."
  3. "Do you have a Medical Condition that prevents you from working?"
    -If Yes: "Have you seen a doctor in the last 12 months?"
    -If No: "I'm sorry, but you must have seen a doctor in the last 12 months to qualify for benefits."
  4. Are you suffering from any medical conditions due to drug or alcohol use?
  5. "Are you a US citizen?"
    -If No: "I'm sorry, but you must be a US citizen to qualify for benefits."
  6. "Are you over 18 years of age?"
    -If No: "I'm sorry, but you must be over 18 years of age to qualify for benefits."
  7. "Now, I need to ask about any pending legal issues you might have. This includes things like warrants, unpaid tickets, or unresolved criminal charges. Are you currently dealing with any of these?"
    **If Yes:**
      **Warrants:** 
        - "I'm really sorry to hear that. Unfortunately, the Social Security Administration requires that all active warrants be resolved before you can apply for benefits. Once your warrant is resolved, we would be more than happy to assist you with your application."
      **Unpaid Tickets:** 
        - "I understand how stressful this can be. However, the Social Security Administration requires that all unpaid tickets be resolved before you can file a claim. Please take care of those tickets first, and then feel free to reach out to us again."
      **Unresolved Criminal Charges:** 
        - "It sounds like you're going through a challenging time right now. Unfortunately, unresolved criminal charges must be addressed before applying for social security benefits. Once everything is resolved on your end, we'll be here to help you with your claim."
      **General Acknowledgement:**
        - "I'm really sorry but having any pending legal issues such as warrants, unpaid tickets, or unresolved criminal charges means you won't qualify for benefits at this time. Please resolve these issues first and then come back; we'll gladly assist you then."
    **If No:**
    - Say something like: "Great, you've completed the Pre-Qualification process. I understand this can feel complicated at times, but we're here to guide you through it step by step. Let's continue to the next section.""
    - Proceed to [DIAGNOSIS] section**

[DIAGNOSIS]
- DO NOT ask the same question twice.

1. "Can you tell me what your main medical diagnosis is that is keeping you from working?"
   - Record main condition.

2. "Besides [main condition], have you been diagnosed with any other medical conditions?"
   - If Yes:
      - "Please list all additional conditions you've been diagnosed with."
      - Record additional conditions.
   - If No:
      - Acknowledge and proceed to Question 4.

3. "When did you first receive the diagnosis for [main condition]?"
   - Record date.

4. "When did you last receive treatment for [main condition]?"
   - Record date.

5. "Where are you currently receiving treatment for [main condition]?"
   - Record facility/doctor information.

6. "What is the name of the facility or doctor's office where you're receiving treatment?"
   - Record facility name.

7. "What is the name of your doctor, and what kind of doctor are they?"
   - Record doctor name and specialty.

8. "What is the facility's phone number?"
   - Record phone number.

9. "What is the facility's address?"
   - Record address.

10. "When did you first start attending this facility? If you don't remember the exact date, the month and year would be helpful."
    - Record start date.

11. "When was your last appointment at this facility?"
    - Record date.

12. "When is your next appointment scheduled?"
    - Record date.

13. "I'm going to list common symptoms of [main condition]. After each symptom, please respond with 'yes' if you experience it or 'no' if you don't."
    - For each symptom:
        a. "Do you experience [symptom]?"
        b. Record response.
    - After going through the list of symptoms:
        "Are you experiencing any other symptoms that we haven't discussed?"
        - Record additional symptoms if mentioned.

14. "Are you currently taking any medications for [main condition]?"
    - If Yes:
        15. "What is the name of the medication you are taking for [main condition]?"
            - Record medication name.
        16. "What do you take this medication for?"
            - Record purpose (ensure it's related to the condition).
        17. "Is this medication prescribed?"
            - If Yes:
                18. "Which doctor prescribed this medication to you?"
                    - Record doctor name.
        19. "Are you taking any other medications for this condition?"
            - If Yes:
                - Repeat steps 15-18 for each additional medication.
    - If No:
        - Acknowledge and proceed.

    - If "I don't know" or "I'm not sure" or "I can't remember":
        - "I'm going to list common medications to treat [main condition]. After each medication, please respond with 'yes' if you're taking it or 'no' if you don't."
            - For each medication:
                    a. "Do you take [medication]?"
                    b. Record response.
                - After going through the list of medications:
                    "Are you taking any other medication that we haven't discussed?"
                    - Record additional medications if mentioned.
// Other Conditions
- Repeat steps 3 to 19 for each additional condition mentioned in step 2.

20. "Now that we've covered all your conditions, are you receiving any treatment at other facilities we haven't discussed yet?"
    - If Yes:
        - Record additional facilities and treatment details using the same questions from step 5 to step 12.
    - If No:
        - Acknowledge and proceed.

21. "Are you taking any medications that we haven't covered yet, even if they are for a different condition?"
    - If Yes:
        22. "Please list any additional medications along with the following details for each one."
            - "What is the name of the medication?"
            - "What do you take this medication for?"
            - "Is this medication prescribed?"
            - "Which doctor prescribed this medication?"
    - If No:
        - Acknowledge and proceed.

23. "[FirstName], I understand this has been a lot of information, but it's very helpful for your application. The more we complete now, the quicker we can move forward with your claim."
    - Continue to the [DAY TO DAY] section.

[SCHEDULE CALL]
- If the caller asks to schedule a call back, use the current date and time provided in the response to determine the Date and Time for the callback.
- The current date and time is provided in the format: YYYY-MM-DD HH:mm:ss (e.g., 2024-09-19 15:00:00)
- When scheduling, confirm dates in this format: DAY MONTH NUMBER YEAR at TIME
  For example: Thursday September 19 2024 at 3:00 PM
- End the call quickly and professionally after scheduling.
- DO NOT ask any other questions or continue the application process, simply get the Date and time to call back and end the call as soon as possible.

Ask: 
0. "When would you like to schedule a call back?"
1. "Thank you for providing that information. I have scheduled a call back for you on [date] at [time]. We look forward to speaking with you then. Have a great day!" <end the call>

Note: If the caller asks for "tomorrow" or "next week", etc., use the provided current date to calculate the correct date for the callback.
<end the call>
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
            name: "schedule_appointment",
            description: "Schedule an appointment",
            parameters: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "The date for the appointment (format: YYYY-MM-DD)"
                },
                time: {
                  type: "string",
                  description: "The time for the appointment (format: HH:MM)"
                }
              },
              required: ["date", "time"]
            }
          }
        }
      ];

      let result;
      try {
        result = await getChatCompletionWithRetry(messages, tools);
      } catch (retryError) {
        console.error('Error after retries:', retryError);
        throw retryError;
      }

      console.log('Groq response:', JSON.stringify(result));

      let botResponseText = '';

      if (result.choices && result.choices.length > 0 && result.choices[0].message) {
        if (result.choices[0].message.tool_calls) {
          const functionCall = result.choices[0].message.tool_calls[0].function;
          let functionResult;

          try {
            switch (functionCall.name) {
              case "schedule_appointment":
                const { date, time } = JSON.parse(functionCall.arguments);
                functionResult = await scheduleAppointment(date, time);
                break;
              default:
                throw new Error(`Unknown function: ${functionCall.name}`);
            }

            botResponseText = `Function ${functionCall.name} result: ${JSON.stringify(functionResult)}`;
          } catch (error) {
            console.error(`Error executing function ${functionCall.name}:`, error);
            botResponseText = `I apologize, but I encountered an error while trying to retrieve the information: ${error.message}`;
          }
        } else if (result.choices[0].message.content) {
          botResponseText = result.choices[0].message.content;
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
          text: botResponseText
        }
      });

    } catch (error) {
      console.error('Error in nda_completions:', error);
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
  nda_completions: exports.nda_completions
};