package com.example.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.community.speechrecognition.SpeechRecognition;
import com.getcapacitor.community.tts.TextToSpeechPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register plugins
        registerPlugin(TextToSpeechPlugin.class);
        registerPlugin(SpeechRecognition.class);
    }
}