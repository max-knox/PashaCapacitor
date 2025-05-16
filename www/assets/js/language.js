$(document).ready(function() {
    // Language Elements
    var spanishElements = document.getElementsByClassName("es");
    var englishElements = document.getElementsByClassName("en");
    const mobile_menu = document.getElementsByClassName("mobile_menu");
    const navbar_toggler = document.querySelector('.navbar-toggler');


    // Set language function
    function setLanguage(lang) {
        if (lang === 'en') {
            $(spanishElements).hide();
            $(englishElements).show();
            localStorage.usrLang = "en";
            console.log('Language is now English');
        } else {
            $(spanishElements).show();
            $(englishElements).hide();
            localStorage.usrLang = "es";
            console.log('Language is now Spanish');
        }

        // If the chatbot is on the page, update its UI
        if ($('.chatbot-welcome-text').length) {
            if (lang === 'en') {
                $('.chatbot-welcome-text').text('Welcome to the Alcanzando Horizontes!');
            } else {
                $('.chatbot-welcome-text').text('¡Bienvenido a Alcanzando Horizontes!');
            }
        }

        $(document).trigger('languageChanged', [lang]);
    }

    $(".enButton, .enButtonMob").on("click", function(){
        setLanguage('en');
        setTimeout(function() {
            location.reload();
          }, 600);
    });

    $(".esButton, .esButtonMob").on("click", function(){
        setLanguage('es');
        setTimeout(function() {
            location.reload();
          }, 600);
    });

    // Toggle the mobile menu on button click
    $(".navbar-toggler").on("click", function(){
        $(mobile_menu).toggle('show');
    });

    // Toggle the mobile menu on button click
    $(".click_space").on("click", function(){
        $(mobile_menu).hide();
    });

    function checkNupdateLang() {
        if (localStorage.usrLang === 'en') {
            setLanguage('en');
            console.log('Language was detected as English, so hiding all Spanish items');
        } else if (localStorage.usrLang === 'es') {
            setLanguage('es');
            console.log('Language was detected as Spanish, so hiding all English items');
        } else {
            setLanguage('en');
            console.log('No Language was set, so setting Language to English as default');
        }
    }

    // Set the language to Spanish by default
    console.log('Setting Language');
    $(mobile_menu).hide();
    var timeoutID = window.setTimeout(checkNupdateLang, 2000); // Declare the variable with var
});