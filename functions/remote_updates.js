const functions = require('firebase-functions');

exports.remoteUpdates = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    
    try {
        const updates = {
            version: "1.0.0",
            updateScript: `
                // Create and inject new buttons
                const buttonContainer = document.querySelector('.button-container');
                if (buttonContainer) {
                    const buttons = [
                        { id: 'ndaBtn', text: 'NDA' },
                        { id: 'knightBtn', text: 'KNIGHT' }
                    ];
                    
                    buttons.forEach(btn => {
                        const button = document.createElement('button');
                        button.id = btn.id;
                        button.className = 'circle-btn terminal-medium';
                        button.textContent = btn.text;
                        buttonContainer.appendChild(button);
                    });
                }

                // Create and inject new mode sections
                const newModes = document.querySelector('.new_modes');
                if (newModes) {
                    const modes = [
                        { class: 'nda-mode', title: 'NDA Mode', content: 'NDA Content' },
                        { class: 'knight-mode', title: 'Knight Mode', content: 'Knight Content' }
                    ];
                    
                    modes.forEach(mode => {
                        const section = document.createElement('div');
                        section.className = mode.class;
                        section.innerHTML = \`
                            <div class="mode-content">
                                <h3>\${mode.title}</h3>
                                <p>\${mode.content}</p>
                            </div>
                        \`;
                        section.style.display = 'none';
                        newModes.appendChild(section);
                    });
                }

                // Add click handlers
                document.querySelectorAll('#ndaBtn, #knightBtn').forEach(button => {
                    button.addEventListener('click', () => {
                        const agentS3 = document.querySelector('.agent_s3');
                        const newModes = document.querySelector('.new_modes');
                        const modeClass = button.id.replace('Btn', '-mode');
                        
                        agentS3.style.display = 'none';
                        newModes.style.display = 'flex';
                        
                        // Hide all modes first
                        document.querySelectorAll('.nda-mode, .knight-mode').forEach(el => {
                            el.style.display = 'none';
                        });
                        
                        // Show selected mode
                        const selectedMode = document.querySelector('.' + modeClass);
                        if (selectedMode) {
                            selectedMode.style.display = 'flex';
                        }
                    });
                });

                // Add click handlers for all mode buttons
                const hideNewModes = () => {
                    const newModes = document.querySelector('.new_modes');
                    if (newModes) {
                        newModes.style.display = 'none';
                    }
                };

                // Add handlers for existing mode buttons
                const existingButtons = [
                    'askAnythingBtn', 'meetingModeBtn', 'chronicleModeBtn',
                    'schedulerBtn', 'messengerBtn', 'newsBtn',
                    'settingsModeBtn', 'historyModeBtn'
                ];

                existingButtons.forEach(btnId => {
                    const btn = document.getElementById(btnId);
                    if (btn) {
                        const originalClick = btn.onclick;
                        btn.onclick = (e) => {
                            hideNewModes();
                            if (originalClick) originalClick(e);
                        };
                    }
                });

                // Update new button click handlers
                document.querySelectorAll('#ndaBtn, #knightBtn').forEach(button => {
                    button.addEventListener('click', () => {
                        const agentS3 = document.querySelector('.agent_s3');
                        const newModes = document.querySelector('.new_modes');
                        const modeClass = button.id.replace('Btn', '-mode');
                        
                        // Hide other sections
                        agentS3.style.display = 'none';
                        document.querySelectorAll('.main-div').forEach(d => d.style.display = 'none');
                        document.querySelector('.meeting-mode').style.display = 'none';
                        
                        // Show new modes container
                        newModes.style.display = 'flex';
                        
                        // Hide all mode contents first
                        document.querySelectorAll('.nda-mode, .knight-mode').forEach(el => {
                            el.style.display = 'none';
                        });
                        
                        // Show selected mode
                        const selectedMode = document.querySelector('.' + modeClass);
                        if (selectedMode) {
                            selectedMode.style.display = 'flex';
                        }
                    });
                });
            `
        };

        res.status(200).json(updates);
    } catch (error) {
        console.error('Error serving updates:', error);
        res.status(500).json({ error: 'Failed to serve updates' });
    }
});
