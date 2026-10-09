from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from typing import Any

from swisseph_rs import (
    Body, 
    CalcFlags, 
    Ephemeris, 
    EphemerisConfig, 
    SiderealMode, 
    RiseSetFlags
)
from astral import LocationInfo
from astral.sun import sun

# --- Initialize Global Ephemeris ---
config = EphemerisConfig(sidereal_mode=SiderealMode.LAHIRI)
eph = Ephemeris(config)

# --- Constants ---
# Language keys: en (English/IAST), te (Telugu), hi (Hindi), ta (Tamil), kn (Kannada), ml (Malayalam).
# hi/ta/kn/ml are script transliterations of the same Sanskrit-derived terms used for en/te
# (not each region's alternate calendar convention, e.g. Tamil's distinct solar month names) —
# kept consistent with how this file already names things. Best-effort; recommend native-speaker
# review, especially for Tamil (phonetic approximation) and the 60-name Samvatsara cycle.
SAMVATSARA_NAMES = [
    {"en":"Prabhava","te":"ప్రభవ","hi":"प्रभव","ta":"பிரபவ","kn":"ಪ್ರಭವ","ml":"പ്രഭവ"},
    {"en":"Vibhava","te":"విభవ","hi":"विभव","ta":"விபவ","kn":"ವಿಭವ","ml":"വിഭവ"},
    {"en":"Śukla","te":"శుక్ల","hi":"शुक्ल","ta":"சுக்ல","kn":"ಶುಕ್ಲ","ml":"ശുക്ല"},
    {"en":"Pramoduta","te":"ప్రమోదూత","hi":"प्रमोद","ta":"பிரமோதூத","kn":"ಪ್ರಮೋದೂತ","ml":"പ്രമോദൂത"},
    {"en":"Prajāpati","te":"ప్రజాపతి","hi":"प्रजापति","ta":"பிரஜாபதி","kn":"ಪ್ರಜಾಪತಿ","ml":"പ്രജാപതി"},
    {"en":"Āngirasa","te":"ఆంగీరస","hi":"अंगिरस","ta":"ஆங்கீரச","kn":"ಆಂಗೀರಸ","ml":"ആംഗീരസ"},
    {"en":"Śrīmukha","te":"శ్రీముఖ","hi":"श्रीमुख","ta":"ஸ்ரீமுக","kn":"ಶ್ರೀಮುಖ","ml":"ശ്രീമുഖ"},
    {"en":"Bhāva","te":"భావ","hi":"भाव","ta":"பவ","kn":"ಭಾವ","ml":"ഭാവ"},
    {"en":"Yuva","te":"యువ","hi":"युवा","ta":"யுவ","kn":"ಯುವ","ml":"യുവ"},
    {"en":"Dhātā","te":"ధాత","hi":"धाता","ta":"தாதா","kn":"ಧಾತಾ","ml":"ധാതാ"},
    {"en":"Īśvara","te":"ఈశ్వర","hi":"ईश्वर","ta":"ஈஸ்வர","kn":"ಈಶ್ವರ","ml":"ഈശ്വര"},
    {"en":"Bahudhānya","te":"బహుధాన్య","hi":"बहुधान्य","ta":"பஹுதான்ய","kn":"ಬಹುಧಾನ್ಯ","ml":"ബഹുധാന്യ"},
    {"en":"Pramāthī","te":"ప్రమాథి","hi":"प्रमाथी","ta":"பிரமாதி","kn":"ಪ್ರಮಾಥಿ","ml":"പ്രമാഥി"},
    {"en":"Vikrama","te":"విక్రమ","hi":"विक्रम","ta":"விக்ரம","kn":"ವಿಕ್ರಮ","ml":"വിക്രമ"},
    {"en":"Vṛṣa","te":"వృష","hi":"वृष","ta":"விருஷ","kn":"ವೃಷ","ml":"വൃഷ"},
    {"en":"Chitrabhānu","te":"చిత్రభాను","hi":"चित्रभानु","ta":"சித்ரபானு","kn":"ಚಿತ್ರಭಾನು","ml":"ചിത്രഭാനു"},
    {"en":"Subhānu","te":"సుభాను","hi":"स्वभानु","ta":"சுபானு","kn":"ಸುಭಾನು","ml":"സുഭാനു"},
    {"en":"Tāraṇa","te":"తారణ","hi":"तारण","ta":"தாரண","kn":"ತಾರಣ","ml":"താരണ"},
    {"en":"Pārthiva","te":"పార్థివ","hi":"पार्थिव","ta":"பார்த்திப","kn":"ಪಾರ್ಥಿವ","ml":"പാർത്ഥിവ"},
    {"en":"Vyaya","te":"వ్యయ","hi":"व्यय","ta":"வியய","kn":"ವ್ಯಯ","ml":"വ്യയ"},
    {"en":"Sarvajit","te":"సర్వజిత్","hi":"सर्वजित","ta":"சர்வஜித்","kn":"ಸರ್ವಜಿತ್","ml":"സർവ്വജിത്ത്"},
    {"en":"Sarvadhārī","te":"సర్వధారి","hi":"सर्वधारी","ta":"சர்வதாரி","kn":"ಸರ್ವಧಾರಿ","ml":"സർവ്വധാരി"},
    {"en":"Virodhi","te":"విరోధి","hi":"विरोधी","ta":"விரோதி","kn":"ವಿರೋಧಿ","ml":"വിരോധി"},
    {"en":"Vikṛti","te":"వికృతి","hi":"विकृति","ta":"விக்ருதி","kn":"ವಿಕೃತಿ","ml":"വികൃതി"},
    {"en":"Khara","te":"ఖర","hi":"खर","ta":"கர","kn":"ಖರ","ml":"ഖര"},
    {"en":"Nandana","te":"నందన","hi":"नंदन","ta":"நந்தன","kn":"ನಂದನ","ml":"നന്ദന"},
    {"en":"Vijaya","te":"విజయ","hi":"विजय","ta":"விஜய","kn":"ವಿಜಯ","ml":"വിജയ"},
    {"en":"Jaya","te":"జయ","hi":"जय","ta":"ஜய","kn":"ಜಯ","ml":"ജയ"},
    {"en":"Manmatha","te":"మన్మథ","hi":"मन्मथ","ta":"மன்மத","kn":"ಮನ್ಮಥ","ml":"മന്മഥ"},
    {"en":"Durmukhi","te":"దుర్ముఖి","hi":"दुर्मुख","ta":"துர்முகி","kn":"ದುರ್ಮುಖಿ","ml":"ദുർമ്മുഖി"},
    {"en":"Hevilambi","te":"హేవిళంబి","hi":"हेमलंब","ta":"ஹேவிளம்பி","kn":"ಹೇವಿಳಂಬಿ","ml":"ഹേവിളംബി"},
    {"en":"Vilambi","te":"విళంబి","hi":"विलंब","ta":"விளம்பி","kn":"ವಿಳಂಬಿ","ml":"വിളംബി"},
    {"en":"Vikārī","te":"వికారి","hi":"विकारी","ta":"விகாரி","kn":"ವಿಕಾರಿ","ml":"വികാരി"},
    {"en":"Śārvarī","te":"శార్వరి","hi":"शार्वरी","ta":"சார்வரி","kn":"ಶಾರ್ವರಿ","ml":"ശാർവരി"},
    {"en":"Plava","te":"ప్లవ","hi":"प्लव","ta":"பிலவ","kn":"ಪ್ಲವ","ml":"പ്ലവ"},
    {"en":"Śubhakṛt","te":"శుభకృత్","hi":"शुभकृत","ta":"சுபகிருது","kn":"ಶುಭಕೃತ್","ml":"ശുഭകൃത്ത്"},
    {"en":"Śobhakṛt","te":"శోభకృత్","hi":"शोभकृत","ta":"சோபகிருது","kn":"ಶೋಭಕೃತ್","ml":"ശോഭകൃത്ത്"},
    {"en":"Krodhi","te":"క్రోధి","hi":"क्रोधी","ta":"குரோதி","kn":"ಕ್ರೋಧಿ","ml":"ക്രോധി"},
    {"en":"Viśvāvasu","te":"విశ్వావసు","hi":"विश्वावसु","ta":"விஸ்வாவசு","kn":"ವಿಶ್ವಾವಸು","ml":"വിശ്വാവസു"},
    {"en":"Parābhava","te":"పరాభవ","hi":"पराभव","ta":"பராபவ","kn":"ಪರಾಭವ","ml":"പരാഭവ"},
    {"en":"Plavaṅga","te":"ప్లవంగ","hi":"प्लवंग","ta":"பிலவங்க","kn":"ಪ್ಲವಂಗ","ml":"പ്ലവംഗ"},
    {"en":"Kīlaka","te":"కీలక","hi":"कीलक","ta":"கீலக","kn":"ಕೀಲಕ","ml":"കീലക"},
    {"en":"Saumya","te":"సౌమ్య","hi":"सौम्य","ta":"சௌமிய","kn":"ಸೌಮ್ಯ","ml":"സൗമ്യ"},
    {"en":"Sādhāraṇa","te":"సాధారణ","hi":"साधारण","ta":"சாதாரண","kn":"ಸಾಧಾರಣ","ml":"സാധാരണ"},
    {"en":"Virodhikṛt","te":"విరోధికృత్","hi":"विरोधकृत","ta":"விரோதிகிருது","kn":"ವಿರೋಧಿಕೃತ್","ml":"വിരോധികൃത്ത്"},
    {"en":"Paridhāvī","te":"పరిధావి","hi":"परिधावी","ta":"பரிதாபி","kn":"ಪರಿಧಾವಿ","ml":"പരിധാവി"},
    {"en":"Pramādi","te":"ప్రమాది","hi":"प्रमादी","ta":"பிரமாதி","kn":"ಪ್ರಮಾದಿ","ml":"പ്രമാദി"},
    {"en":"Ānanda","te":"ఆనంద","hi":"आनंद","ta":"ஆனந்த","kn":"ಆನಂದ","ml":"ആനന്ദ"},
    {"en":"Rākṣasa","te":"రాక్షస","hi":"राक्षस","ta":"ராட்சச","kn":"ರಾಕ್ಷಸ","ml":"രാക്ഷസ"},
    {"en":"Nala","te":"నల","hi":"नल","ta":"நள","kn":"ನಳ","ml":"നള"},
    {"en":"Piṅgala","te":"పింగళ","hi":"पिंगल","ta":"பிங்கள","kn":"ಪಿಂಗಳ","ml":"പിംഗള"},
    {"en":"Kālayukta","te":"కాలయుక్త","hi":"कालयुक्त","ta":"காளயுக்தி","kn":"ಕಾಲಯುಕ್ತ","ml":"കാലയുക്ത"},
    {"en":"Siddhārthi","te":"సిద్ధార్థి","hi":"सिद्धार्थी","ta":"சித்தார்த்தி","kn":"ಸಿದ್ಧಾರ್ಥಿ","ml":"സിദ്ധാർത്ഥി"},
    {"en":"Raudra","te":"రౌద్ర","hi":"रौद्र","ta":"ரௌத்திரி","kn":"ರೌದ್ರ","ml":"രൗദ്ര"},
    {"en":"Durmati","te":"దుర్మతి","hi":"दुर्मति","ta":"துர்மதி","kn":"ದುರ್ಮತಿ","ml":"ദുർമ്മതി"},
    {"en":"Dundubhi","te":"దుందుభి","hi":"दुंदुभि","ta":"துந்துபி","kn":"ದುಂದುಭಿ","ml":"ദുന്ദുഭി"},
    {"en":"Rudhirodgārī","te":"రుధిరోద్గారి","hi":"रुधिरोद्गारी","ta":"ருதிரோத்காரி","kn":"ರುಧಿರೋದ್ಗಾರಿ","ml":"രുധിരോദ്ഗാരി"},
    {"en":"Raktākṣi","te":"రక్తాక్షి","hi":"रक्ताक्षी","ta":"ரக்தாட்சி","kn":"ರಕ್ತಾಕ್ಷಿ","ml":"രക്താക്ഷി"},
    {"en":"Krodhana","te":"క్రోధన","hi":"क्रोधन","ta":"குரோதன","kn":"ಕ್ರೋಧನ","ml":"ക്രോധന"},
    {"en":"Akṣaya","te":"అక్షయ","hi":"अक्षय","ta":"அட்சய","kn":"ಅಕ್ಷಯ","ml":"അക്ഷയ"},
]

TITHI_NAMES_15 = [
    {"en":"Pratipadā","te":"పాడ్యమి","hi":"प्रतिपदा","ta":"பிரதிபதை","kn":"ಪಾಡ್ಯ","ml":"പ്രഥമ"},
    {"en":"Dvitīyā","te":"విదియ","hi":"द्वितीया","ta":"துவிதியை","kn":"ಬಿದಿಗೆ","ml":"ദ്വിതീയ"},
    {"en":"Tṛtīyā","te":"తదియ","hi":"तृतीया","ta":"திரிதியை","kn":"ತದಿಗೆ","ml":"തൃതീയ"},
    {"en":"Chaturthī","te":"చవితి","hi":"चतुर्थी","ta":"சதுர்த்தி","kn":"ಚೌತಿ","ml":"ചതുർത്ഥി"},
    {"en":"Pañcamī","te":"పంచమి","hi":"पंचमी","ta":"பஞ்சமி","kn":"ಪಂಚಮಿ","ml":"പഞ്ചമി"},
    {"en":"Ṣaṣṭhī","te":"షష్టి","hi":"षष्ठी","ta":"சஷ்டி","kn":"ಷಷ್ಠಿ","ml":"ഷഷ്ഠി"},
    {"en":"Saptamī","te":"సప్తమి","hi":"सप्तमी","ta":"சப்தமி","kn":"ಸಪ್ತಮಿ","ml":"സപ്തമി"},
    {"en":"Aṣṭamī","te":"అష్టమి","hi":"अष्टमी","ta":"அஷ்டமி","kn":"ಅಷ್ಟಮಿ","ml":"അഷ്ടമി"},
    {"en":"Navamī","te":"నవమి","hi":"नवमी","ta":"நவமி","kn":"ನವಮಿ","ml":"നവമി"},
    {"en":"Daśamī","te":"దశమి","hi":"दशमी","ta":"தசமி","kn":"ದಶಮಿ","ml":"ദശമി"},
    {"en":"Ekādaśī","te":"ఏకాదశి","hi":"एकादशी","ta":"ஏகாதசி","kn":"ಏಕಾದಶಿ","ml":"ഏകാദശി"},
    {"en":"Dvādaśī","te":"ద్వాదశి","hi":"द्वादशी","ta":"துவாதசி","kn":"ದ್ವಾದಶಿ","ml":"ദ്വാദശി"},
    {"en":"Trayodaśī","te":"త్రయోదశి","hi":"त्रयोदशी","ta":"திரயோதசி","kn":"ತ್ರಯೋದಶಿ","ml":"ത്രയോദശി"},
    {"en":"Chaturdaśī","te":"చతుర్దశి","hi":"चतुर्दशी","ta":"சதுர்த்தசி","kn":"ಚತುರ್ದಶಿ","ml":"ചതുർദശി"},
]
TITHI_NAMES = TITHI_NAMES_15 + [
    {"en":"Pūrṇimā","te":"పౌర్ణమి","hi":"पूर्णिमा","ta":"பௌர்ணமி","kn":"ಹುಣ್ಣಿಮೆ","ml":"പൗർണ്ണമി"},
] + TITHI_NAMES_15 + [
    {"en":"Amāvāsyā","te":"అమావాస్య","hi":"अमावस्या","ta":"அமாவாசை","kn":"ಅಮಾವಾಸ್ಯೆ","ml":"അമാവാസി"},
]

NAKSHATRA_NAMES = [
    {"en":"Aśvinī","te":"అశ్విని","hi":"अश्विनी","ta":"அஸ்வினி","kn":"ಅಶ್ವಿನಿ","ml":"അശ്വതി"},
    {"en":"Bharaṇī","te":"భరణి","hi":"भरणी","ta":"பரணி","kn":"ಭರಣಿ","ml":"ഭരണി"},
    {"en":"Kṛttikā","te":"కృత్తిక","hi":"कृत्तिका","ta":"கார்த்திகை","kn":"ಕೃತ್ತಿಕಾ","ml":"കാർത്തിക"},
    {"en":"Rohiṇī","te":"రోహిణి","hi":"रोहिणी","ta":"ரோகிணி","kn":"ರೋಹಿಣಿ","ml":"രോഹിണി"},
    {"en":"Mṛgaśira","te":"మృగశిర","hi":"मृगशिरा","ta":"மிருகசீரிடம்","kn":"ಮೃಗಶಿರ","ml":"മകയിരം"},
    {"en":"Ārdrā","te":"ఆర్ద్ర","hi":"आर्द्रा","ta":"திருவாதிரை","kn":"ಆರ್ದ್ರಾ","ml":"തിരുവാതിര"},
    {"en":"Punarvasu","te":"పునర్వసు","hi":"पुनर्वसु","ta":"புனர்பூசம்","kn":"ಪುನರ್ವಸು","ml":"പുണർതം"},
    {"en":"Puṣya","te":"పుష్యమి","hi":"पुष्य","ta":"பூசம்","kn":"ಪುಷ್ಯ","ml":"പൂയം"},
    {"en":"Āśleṣā","te":"ఆశ్లేష","hi":"आश्लेषा","ta":"ஆயில்யம்","kn":"ಆಶ್ಲೇಷಾ","ml":"ആയില്യം"},
    {"en":"Maghā","te":"మఘ","hi":"मघा","ta":"மகம்","kn":"ಮಘಾ","ml":"മകം"},
    {"en":"Pūrva Phalgunī","te":"పూర్వ ఫాల్గుణి","hi":"पूर्वाफाल्गुनी","ta":"பூரம்","kn":"ಪೂರ್ವಾಫಲ್ಗುಣಿ","ml":"പൂരം"},
    {"en":"Uttara Phalgunī","te":"ఉత్తర ఫాల్గుణి","hi":"उत्तराफाल्गुनी","ta":"உத்திரம்","kn":"ಉತ್ತರಾಫಲ್ಗುಣಿ","ml":"ഉത്രം"},
    {"en":"Hasta","te":"హస్త","hi":"हस्त","ta":"அஸ்தம்","kn":"ಹಸ್ತ","ml":"അത്തം"},
    {"en":"Chitrā","te":"చిత్ర","hi":"चित्रा","ta":"சித்திரை","kn":"ಚಿತ್ರಾ","ml":"ചിത്ര"},
    {"en":"Svāti","te":"స్వాతి","hi":"स्वाति","ta":"சுவாதி","kn":"ಸ್ವಾತಿ","ml":"ചോതി"},
    {"en":"Viśākhā","te":"విశాఖ","hi":"विशाखा","ta":"விசாகம்","kn":"ವಿಶಾಖಾ","ml":"വിശാഖം"},
    {"en":"Anurādhā","te":"అనూరాధ","hi":"अनुराधा","ta":"அனுஷம்","kn":"ಅನುರಾಧಾ","ml":"അനിഴം"},
    {"en":"Jyeṣṭhā","te":"జ్యేష్ఠ","hi":"ज्येष्ठा","ta":"கேட்டை","kn":"ಜ್ಯೇಷ್ಠಾ","ml":"തൃക്കേട്ട"},
    {"en":"Mūla","te":"మూల","hi":"मूल","ta":"மூலம்","kn":"ಮೂಲಾ","ml":"മൂലം"},
    {"en":"Pūrvāṣāḍha","te":"పూర్వాషాఢ","hi":"पूर्वाषाढ़ा","ta":"பூராடம்","kn":"ಪೂರ್ವಾಷಾಢ","ml":"പൂരാടം"},
    {"en":"Uttarāṣāḍha","te":"ఉత్తరాషాఢ","hi":"उत्तराषाढ़ा","ta":"உத்திராடம்","kn":"ಉತ್ತರಾಷಾಢ","ml":"ഉത്രാടം"},
    {"en":"Śravaṇa","te":"శ్రవణం","hi":"श्रवण","ta":"திருவோணம்","kn":"ಶ್ರವಣ","ml":"തിരുവോണം"},
    {"en":"Dhaniṣṭhā","te":"ధనిష్ఠ","hi":"धनिष्ठा","ta":"அவிட்டம்","kn":"ಧನಿಷ್ಠಾ","ml":"അവിട്ടം"},
    {"en":"Śatabhiṣā","te":"శతభిషం","hi":"शतभिषा","ta":"சதயம்","kn":"ಶತಭಿಷಾ","ml":"ചതയം"},
    {"en":"Pūrva Bhādrapadā","te":"పూర్వాభాద్ర","hi":"पूर्वाभाद्रपदा","ta":"பூரட்டாதி","kn":"ಪೂರ್ವಾಭಾದ್ರಪದ","ml":"പൂരുരുട്ടാതി"},
    {"en":"Uttara Bhādrapadā","te":"ఉత్తరాభాద్ర","hi":"उत्तराभाद्रपदा","ta":"உத்திரட்டாதி","kn":"ಉತ್ತರಾಭಾದ್ರಪದ","ml":"ഉത്തൃട്ടാതി"},
    {"en":"Revatī","te":"రేవతి","hi":"रेवती","ta":"ரேவதி","kn":"ರೇವತಿ","ml":"രേവതി"},
]

YOGA_NAMES = [
    {"en":"Viṣkambha","te":"విష్కంభ","hi":"विष्कम्भ","ta":"விஷ்கம்பம்","kn":"ವಿಷ್ಕಂಭ","ml":"വിഷ്കംഭം"},
    {"en":"Prīti","te":"ప్రీతి","hi":"प्रीति","ta":"ப்ரீதி","kn":"ಪ್ರೀತಿ","ml":"പ്രീതി"},
    {"en":"Āyuṣmān","te":"ఆయుష్మాన్","hi":"आयुष्मान्","ta":"ஆயுஷ்மான்","kn":"ಆಯುಷ್ಮಾನ್","ml":"ആയുഷ്മാൻ"},
    {"en":"Saubhāgya","te":"సౌభాగ్య","hi":"सौभाग्य","ta":"சௌபாக்யம்","kn":"ಸೌಭಾಗ್ಯ","ml":"സൗഭാഗ്യം"},
    {"en":"Śobhana","te":"శోభన","hi":"शोभन","ta":"சோபனம்","kn":"ಶೋಭನ","ml":"ശോഭനം"},
    {"en":"Atigaṇḍa","te":"అతిగండ","hi":"अतिगण्ड","ta":"அதிகண்டம்","kn":"ಅತಿಗಂಡ","ml":"അതിഗണ്ഡം"},
    {"en":"Sukarma","te":"సుకర్మ","hi":"सुकर्मा","ta":"சுகர்மா","kn":"ಸುಕರ್ಮ","ml":"സുകർമ്മ"},
    {"en":"Dhṛti","te":"ధృతి","hi":"धृति","ta":"த்ருதி","kn":"ಧೃತಿ","ml":"ധൃതി"},
    {"en":"Śūla","te":"శూల","hi":"शूल","ta":"சூலம்","kn":"ಶೂಲ","ml":"ശൂലം"},
    {"en":"Gaṇḍa","te":"గండ","hi":"गण्ड","ta":"கண்டம்","kn":"ಗಂಡ","ml":"ഗണ്ഡം"},
    {"en":"Vṛddhi","te":"వృద్ధి","hi":"वृद्धि","ta":"வ்ருத்தி","kn":"ವೃದ್ಧಿ","ml":"വൃദ്ധി"},
    {"en":"Dhruva","te":"ధ్రువ","hi":"ध्रुव","ta":"த்ருவம்","kn":"ಧ್ರುವ","ml":"ധ്രുവം"},
    {"en":"Vyāghāta","te":"వ్యాఘాత","hi":"व्याघात","ta":"வியாகாதம்","kn":"ವ್ಯಾಘಾತ","ml":"വ്യാഘാതം"},
    {"en":"Harṣaṇa","te":"హర్షణ","hi":"हर्षण","ta":"ஹர்ஷணம்","kn":"ಹರ್ಷಣ","ml":"ഹർഷണം"},
    {"en":"Vajra","te":"వజ్ర","hi":"वज्र","ta":"வஜ்ரம்","kn":"ವಜ್ರ","ml":"വജ്രം"},
    {"en":"Siddhi","te":"సిద్ధి","hi":"सिद्धि","ta":"சித்தி","kn":"ಸಿದ್ಧಿ","ml":"സിദ്ധി"},
    {"en":"Vyatipāta","te":"వ్యతిపాత","hi":"व्यतीपात","ta":"வ்யதீபாதம்","kn":"ವ್ಯತೀಪಾತ","ml":"വ്യതീപാതം"},
    {"en":"Varīyān","te":"వరీయాన్","hi":"वरीयान्","ta":"வரீயான்","kn":"ವರೀಯಾನ್","ml":"വരീയാൻ"},
    {"en":"Parigha","te":"పరిఘ","hi":"परिघ","ta":"பரிகம்","kn":"ಪರಿಘ","ml":"പരിഘം"},
    {"en":"Śiva","te":"శివ","hi":"शिव","ta":"சிவம்","kn":"ಶಿವ","ml":"ശിവം"},
    {"en":"Siddha","te":"సిద్ధ","hi":"सिद्ध","ta":"சித்தம்","kn":"ಸಿದ್ಧ","ml":"സിദ്ധം"},
    {"en":"Sādhya","te":"సాధ్య","hi":"साध्य","ta":"சாத்யம்","kn":"ಸಾಧ್ಯ","ml":"സാധ്യം"},
    {"en":"Śubha","te":"శుభ","hi":"शुभ","ta":"சுபம்","kn":"ಶುಭ","ml":"ശുഭം"},
    {"en":"Śukla","te":"శుక్ల","hi":"शुक्ल","ta":"சுக்லம்","kn":"ಶುಕ್ಲ","ml":"ശുക്ലം"},
    {"en":"Brahma","te":"బ్రహ్మ","hi":"ब्रह्म","ta":"ப்ரம்மம்","kn":"ಬ್ರಹ್ಮ","ml":"ബ്രഹ്മം"},
    {"en":"Aindra","te":"ఐంద్ర","hi":"ऐन्द्र","ta":"ஐந்திரம்","kn":"ಐಂದ್ರ","ml":"ഐന്ദ്രം"},
    {"en":"Vaidhṛti","te":"వైధృతి","hi":"वैधृति","ta":"வைத்ருதி","kn":"ವೈಧೃತಿ","ml":"വൈധൃതി"},
]

KARANA_NAMES = [
    {"en":"Bava","te":"బవ","hi":"बव","ta":"பவ","kn":"ಬವ","ml":"ബവ"},
    {"en":"Bālava","te":"బాలవ","hi":"बालव","ta":"பாலவ","kn":"ಬಾಲವ","ml":"ബാലവ"},
    {"en":"Kaulava","te":"కౌలవ","hi":"कौलव","ta":"கௌலவ","kn":"ಕೌಲವ","ml":"കൗലവ"},
    {"en":"Taitila","te":"తైతిల","hi":"तैतिल","ta":"தைதில","kn":"ತೈತಿಲ","ml":"തൈതില"},
    {"en":"Gara","te":"గరజ","hi":"गर","ta":"கரஜ","kn":"ಗರ","ml":"ഗര"},
    {"en":"Vaṇija","te":"వణిజ","hi":"वणिज","ta":"வணிஜ","kn":"ವಣಿಜ","ml":"വണിജ"},
    {"en":"Viṣṭi","te":"విష్టి","hi":"विष्टि","ta":"விஷ்டி","kn":"ವಿಷ್ಟಿ","ml":"വിഷ്ടി"},
    {"en":"Śakuni","te":"శకుని","hi":"शकुनि","ta":"சகுனி","kn":"ಶಕುನಿ","ml":"ശകുനി"},
    {"en":"Chatuṣpāda","te":"చతుష్పాద","hi":"चतुष्पाद","ta":"சதுஷ்பாத","kn":"ಚತುಷ್ಪಾದ","ml":"ചതുഷ്പാദ"},
    {"en":"Nāga","te":"నాగ","hi":"नाग","ta":"நாக","kn":"ನಾಗ","ml":"നാഗ"},
    {"en":"Kiṃstughna","te":"కింస్తుఘ్న","hi":"किंस्तुघ्न","ta":"கிம்ஸ்துக்ன","kn":"ಕಿಂಸ್ತುಘ್ನ","ml":"കിംസ്തുഘ്ന"},
]

VARA_NAMES = [
    {"en":"Monday","te":"సోమవారం","hi":"सोमवार","ta":"திங்கள்","kn":"ಸೋಮವಾರ","ml":"തിങ്കൾ"},
    {"en":"Tuesday","te":"మంగళవారం","hi":"मंगलवार","ta":"செவ்வாய்","kn":"ಮಂಗಳವಾರ","ml":"ചൊവ്വ"},
    {"en":"Wednesday","te":"బుధవారం","hi":"बुधवार","ta":"புதன்","kn":"ಬುಧವಾರ","ml":"ബുധൻ"},
    {"en":"Thursday","te":"గురువారం","hi":"गुरुवार","ta":"வியாழன்","kn":"ಗುರುವಾರ","ml":"വ്യാഴം"},
    {"en":"Friday","te":"శుక్రవారం","hi":"शुक्रवार","ta":"வெள்ளி","kn":"ಶುಕ್ರವಾರ","ml":"വെള്ളി"},
    {"en":"Saturday","te":"శనివారం","hi":"शनिवार","ta":"சனி","kn":"ಶನಿವಾರ","ml":"ശനി"},
    {"en":"Sunday","te":"ఆదివారం","hi":"रविवार","ta":"ஞாயிறு","kn":"ಭಾನುವಾರ","ml":"ഞായർ"},
]

# The classical Panchanga "Vara" anga uses Sanskrit planetary epithets
# (Bhanu for Sunday etc.), distinct from the everyday calendar weekday name
# above (VARA_NAMES) even though both derive from the same 7 grahas.
# Same weekday() indexing as VARA_NAMES (Monday=0 ... Sunday=6). Verified
# against multiple classical-Panchanga references before adding.
VEDA_VARA_NAMES = [
    {"en":"Indu","te":"ఇందు","hi":"इन्दु","ta":"இந்து","kn":"ಇಂದು","ml":"ഇന്ദു"},          # Monday
    {"en":"Bhauma","te":"భౌమ","hi":"भौम","ta":"பௌம","kn":"ಭೌಮ","ml":"ഭൗമ"},              # Tuesday
    {"en":"Saumya","te":"సౌమ్య","hi":"सौम्य","ta":"சௌம்ய","kn":"ಸೌಮ್ಯ","ml":"സൗമ്യ"},      # Wednesday
    {"en":"Bruhaspathi","te":"బృహస్పతి","hi":"बृहस्पति","ta":"பிருஹஸ்பதி","kn":"ಬೃಹಸ್ಪತಿ","ml":"ബൃഹസ്പതി"},                    # Thursday
    {"en":"Bhrigu","te":"భృగు","hi":"भृगु","ta":"பிருகு","kn":"ಭೃಗು","ml":"ഭൃഗു"},          # Friday
    {"en":"Sthira","te":"స్థిర","hi":"स्थिर","ta":"ஸ்திர","kn":"ಸ್ಥಿರ","ml":"സ്ഥിര"},      # Saturday
    {"en":"Bhanu","te":"భాను","hi":"भानु","ta":"பானு","kn":"ಭಾನು","ml":"ഭാനു"},            # Sunday
]

MASA_NAMES = [
    {"en":"Chaitra","te":"చైత్రము","hi":"चैत्र","ta":"சைத்திரம்","kn":"ಚೈತ್ರ","ml":"ചൈത്രം"},
    {"en":"Vaiśākha","te":"వైశాఖము","hi":"वैशाख","ta":"வைசாகம்","kn":"ವೈಶಾಖ","ml":"വൈശാഖം"},
    {"en":"Jyeṣṭha","te":"జ్యేష్ఠము","hi":"ज्येष्ठ","ta":"ஜ்யேஷ்டம்","kn":"ಜ್ಯೇಷ್ಠ","ml":"ജ്യേഷ്ഠം"},
    {"en":"Āṣāḍha","te":"ఆషాఢము","hi":"आषाढ़","ta":"ஆஷாடம்","kn":"ಆಷಾಢ","ml":"ആഷാഢം"},
    {"en":"Śrāvaṇa","te":"శ్రావణము","hi":"श्रावण","ta":"ஸ்ராவணம்","kn":"ಶ್ರಾವಣ","ml":"ശ്രാവണം"},
    {"en":"Bhādrapada","te":"భాద్రపదము","hi":"भाद्रपद","ta":"பாத்ரபதம்","kn":"ಭಾದ್ರಪದ","ml":"ഭാദ്രപദം"},
    {"en":"Āśvina","te":"ఆశ్వయుజము","hi":"आश्विन","ta":"ஆஸ்வினம்","kn":"ಆಶ್ವಯುಜ","ml":"ആശ്വിനം"},
    {"en":"Kārtika","te":"కార్తీకము","hi":"कार्तिक","ta":"கார்த்திகை","kn":"ಕಾರ್ತೀಕ","ml":"കാർത്തികം"},
    {"en":"Mārgaśīrṣa","te":"మార్గశిరము","hi":"मार्गशीर्ष","ta":"மார்கழி","kn":"ಮಾರ್ಗಶಿರ","ml":"മാർഗശീർഷം"},
    {"en":"Pauṣa","te":"పుష్యము","hi":"पौष","ta":"புஷ்யம்","kn":"ಪುಷ್ಯ","ml":"പൗഷം"},
    {"en":"Māgha","te":"మాఘము","hi":"माघ","ta":"மாகம்","kn":"ಮಾಘ","ml":"മാഘം"},
    {"en":"Phālguna","te":"ఫాల్గుణము","hi":"फाल्गुन","ta":"பங்குனி","kn":"ಫಾಲ್ಗುಣ","ml":"ഫാൽഗുനം"},
]

# Suryamana (solar-calendar) masa names, keyed by Rashi index (0=Mesha…11=Meena)
# — distinct from MASA_NAMES above, which are the lunar Chandramana names.
# Real Telugu/Andhra-Telangana Suryamana panchangams name solar months
# directly after the Rashi ("Mesha Masam", "Karka Masam"...), not after the
# lunar Chaitra/Vaishakha sequence.
SOLAR_MASA_NAMES = [
    {"en":"Mesha Masam","te":"మేష మాసం","hi":"मेष मास","ta":"மேஷ மாசம்","kn":"ಮೇಷ ಮಾಸ","ml":"മേഷ മാസം"},
    {"en":"Vrishabha Masam","te":"వృషభ మాసం","hi":"वृषभ मास","ta":"ரிஷப மாசம்","kn":"ವೃಷಭ ಮಾಸ","ml":"വൃഷഭ മാസം"},
    {"en":"Mithuna Masam","te":"మిథున మాసం","hi":"मिथुन मास","ta":"மிதுன மாசம்","kn":"ಮಿಥುನ ಮಾಸ","ml":"മിഥുന മാസം"},
    {"en":"Karka Masam","te":"కర్క మాసం","hi":"कर्क मास","ta":"கடக மாசம்","kn":"ಕರ್ಕ ಮಾಸ","ml":"കർക്ക മാസം"},
    {"en":"Simha Masam","te":"సింహ మాసం","hi":"सिंह मास","ta":"சிம்ம மாசம்","kn":"ಸಿಂಹ ಮಾಸ","ml":"സിംഹ മാസം"},
    {"en":"Kanya Masam","te":"కన్యా మాసం","hi":"कन्या मास","ta":"கன்னி மாசம்","kn":"ಕನ್ಯಾ ಮಾಸ","ml":"കന്നി മാസം"},
    {"en":"Tula Masam","te":"తులా మాసం","hi":"तुला मास","ta":"துலா மாசம்","kn":"ತುಲಾ ಮಾಸ","ml":"തുലാ മാസം"},
    {"en":"Vrishchika Masam","te":"వృశ్చిక మాసం","hi":"वृश्चिक मास","ta":"விருச்சிக மாசம்","kn":"ವೃಶ್ಚಿಕ ಮಾಸ","ml":"വൃശ്ചിക മാസം"},
    {"en":"Dhanu Masam","te":"ధనుర్ మాసం","hi":"धनु मास","ta":"தனுசு மாசம்","kn":"ಧನು ಮಾಸ","ml":"ധനു മാസം"},
    {"en":"Makara Masam","te":"మకర మాసం","hi":"मकर मास","ta":"மகர மாசம்","kn":"ಮಕರ ಮಾಸ","ml":"മകര മാസം"},
    {"en":"Kumbha Masam","te":"కుంభ మాసం","hi":"कुंभ मास","ta":"கும்ப மாசம்","kn":"ಕುಂಭ ಮಾಸ","ml":"കുംഭ മാസം"},
    {"en":"Meena Masam","te":"మీన మాసం","hi":"मीन मास","ta":"மீன மாசம்","kn":"ಮೀನ ಮಾಸ","ml":"മീന മാസം"},
]

RITU_NAMES = [
    {"en":"Vasanta Ṛtu","te":"వసంత ఋతువు","hi":"वसंत ऋतु","ta":"வசந்த ருது","kn":"ವಸಂತ ಋತು","ml":"വസന്ത ഋതു"},
    {"en":"Grīṣma Ṛtu","te":"గ్రీష్మ ఋతువు","hi":"ग्रीष्म ऋतु","ta":"கிரீஷ்ம ருது","kn":"ಗ್ರೀಷ್ಮ ಋತು","ml":"ഗ്രീഷ്മ ഋതു"},
    {"en":"Varṣā Ṛtu","te":"వర్ష ఋతువు","hi":"वर्षा ऋतु","ta":"வர்ஷ ருது","kn":"ವರ್ಷ ಋತು","ml":"വർഷ ഋതു"},
    {"en":"Śarad Ṛtu","te":"శరదృతువు","hi":"शरद ऋतु","ta":"சரத் ருது","kn":"ಶರದ್ ಋತು","ml":"ശരദ് ഋതു"},
    {"en":"Hemanta Ṛtu","te":"హేమంత ఋతువు","hi":"हेमंत ऋतु","ta":"ஹேமந்த ருது","kn":"ಹೇಮಂತ ಋತು","ml":"ഹേമന്ത ഋതു"},
    {"en":"Śiśira Ṛtu","te":"శిశిర ఋతువు","hi":"शिशिर ऋतु","ta":"சிசிர ருது","kn":"ಶಿಶಿರ ಋತು","ml":"ശിശിര ഋതു"},
]

AYANAM_NAMES = [
    {"en": "Uttarāyaṇam", "te": "ఉత్తరాయణం", "hi": "उत्तरायण", "ta": "உத்தராயணம்", "kn": "ಉತ್ತರಾಯಣ", "ml": "ഉത്തരായണം"},
    {"en": "Dakṣiṇāyanam", "te": "దక్షిణాయణం", "hi": "दक्षिणायन", "ta": "தக்ஷிணாயணம்", "kn": "ದಕ್ಷಿಣಾಯಣ", "ml": "ദക്ഷിണായനം"},
]

PAKSHA_NAMES = [
    {"en": "Śukla Pakṣa", "te": "శుక్ల పక్షం", "hi": "शुक्ल पक्ष", "ta": "சுக்ல பக்ஷம்", "kn": "ಶುಕ್ಲ ಪಕ್ಷ", "ml": "ശുക്ല പക്ഷം"},
    {"en": "Kṛṣṇa Pakṣa", "te": "కృష్ణ పక్షం", "hi": "कृष्ण पक्ष", "ta": "கிருஷ்ண பக்ஷம்", "kn": "ಕೃಷ್ಣ ಪಕ್ಷ", "ml": "കൃഷ്ണ പക്ഷം"},
]

TILL = {
    "en": "till", "te": "వరకు", "hi": "तक", "ta": "வரை", "kn": "ವರೆಗೆ", "ml": "വരെ",
}
TOMORROW = {
    "en": "tomorrow", "te": "రేపు", "hi": "कल", "ta": "நாளை", "kn": "ನಾಳೆ", "ml": "നാളെ",
}
ADHIKA = {
    "en": "Adhika", "te": "అధిక", "hi": "अधिक", "ta": "அதிக", "kn": "ಅಧಿಕ", "ml": "അധിക",
}
LANGS = ("en", "te", "hi", "ta", "kn", "ml")

RAHUKALAM_SEGMENT = {0: 2, 1: 7, 2: 5, 3: 6, 4: 4, 5: 3, 6: 8}
YAMAGANDA_SEGMENT = {0: 4, 1: 3, 2: 2, 3: 1, 4: 7, 5: 6, 6: 5}
GULIKA_SEGMENT = {0: 6, 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 7}

# Dur Muhurtam muhurta indices (1-15, dividing sunrise→sunset into 15 equal
# muhurtas) per weekday, keyed Monday=0 .. Sunday=6. Values match PVR
# Narasimha Rao's JHora (via PyJHora's per-weekday sunrise-offset table) and
# were spot-checked against drikpanchang. Imported by core/muhurtam.py so
# both code paths stay in sync.
DUR_MUHURTA_INDICES = {
    0: [9, 12],   # Monday
    1: [4, 7],    # Tuesday
    2: [8],       # Wednesday
    3: [6, 12],   # Thursday
    4: [4, 9],    # Friday
    5: [3],       # Saturday
    6: [14],      # Sunday
}

# Per-nakshatra start points (Aśvinī .. Revatī) for Varjyam and Amrita Kalam,
# in ghatis from the start of the nakshatra (out of 60). Both spans last
# 4 ghatis. The fractions are applied to the nakshatra's *actual* duration
# at the point of use, not a nominal 24h, so the kalas follow the true
# (variable) speed of the Moon. Both tables are JHora's (PyJHora's
# amrita_gadiya_varjyam_star_map, ×2.5 to convert its /24 units to /60);
# verified against drikpanchang for Rohiṇī, Punarvasu and Pūrvāṣāḍha.
NAKSHATRA_VARJYAM_GHATIS = (
    50, 24, 30, 40, 14, 21, 30, 20, 32, 30, 20, 18, 21, 20,
    14, 14, 10, 14, 20, 24, 20, 10, 10, 18, 16, 24, 30,
)
NAKSHATRA_AMRITA_GHATIS = (
    42, 48, 54, 52, 38, 35, 54, 44, 56, 54, 44, 42, 45, 44,
    38, 38, 34, 38, 44, 48, 44, 34, 34, 42, 40, 48, 54,
)


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0")


def _julian_day_ut(dt_utc: datetime) -> float:
    j2000_epoch = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    return 2451545.0 + (dt_utc - j2000_epoch).total_seconds() / 86400.0


def _sun_moon_longitudes(jd: float) -> tuple[float, float]:
    flags = CalcFlags.SIDEREAL | CalcFlags.SWIEPH
    sun_lon = eph.calc_ut(jd, Body.SUN, flags).data[0]
    moon_lon = eph.calc_ut(jd, Body.MOON, flags).data[0]
    return sun_lon % 360, moon_lon % 360


def  _find_end_time(start_utc: datetime, target_index: int, unit_deg: float, diff: bool, max_hours: int = 30) -> datetime:
    step = timedelta(minutes=2)
    cur = start_utc
    end = start_utc + timedelta(hours=max_hours)
    prev_idx = target_index
    while cur < end:
        jd = _julian_day_ut(cur)
        sun_lon, moon_lon = _sun_moon_longitudes(jd)
        val = (moon_lon - sun_lon) % 360 if diff else moon_lon
        idx = int(val / unit_deg)
        if idx != prev_idx:
            lo, hi = cur - step, cur
            for _ in range(10):
                mid = lo + (hi - lo) / 2
                jdm = _julian_day_ut(mid)
                sl, ml = _sun_moon_longitudes(jdm)
                v = (ml - sl) % 360 if diff else ml
                i = int(v / unit_deg)
                if i == prev_idx:
                    lo = mid
                else:
                    hi = mid
            return hi
        cur += step
    return end


def _find_start_time(ref_utc: datetime, target_index: int, unit_deg: float, diff: bool, max_hours: int = 30) -> datetime:
    """UTC instant the anga identified by `target_index` began, searching
    backward from `ref_utc`. Backward mirror of `_find_end_time`; used to
    bracket the current nakshatra for the nakshatra-scaled kalas (Varjyam /
    Amrita Kalam)."""
    step = timedelta(minutes=2)
    cur = ref_utc
    end = ref_utc - timedelta(hours=max_hours)
    while cur > end:
        jd = _julian_day_ut(cur)
        sun_lon, moon_lon = _sun_moon_longitudes(jd)
        val = (moon_lon - sun_lon) % 360 if diff else moon_lon
        idx = int(val / unit_deg)
        if idx != target_index:
            lo, hi = cur, cur + step  # lo: before the boundary, hi: on/after it
            for _ in range(10):
                mid = lo + (hi - lo) / 2
                jdm = _julian_day_ut(mid)
                sl, ml = _sun_moon_longitudes(jdm)
                v = (ml - sl) % 360 if diff else ml
                i = int(v / unit_deg)
                if i == target_index:
                    hi = mid
                else:
                    lo = mid
            return hi
        cur -= step
    return end


def _hindu_month_index(sun_lon_at_amavasya: float) -> int:
    rashi = int(sun_lon_at_amavasya / 30)
    return (rashi + 1) % 12


def _masa_and_adhika(start_nm_utc: datetime) -> tuple[int, bool]:
    """Given the new moon (Amavasya) that begins a lunar month, return
    (masa_index, is_adhika_masa).

    A lunar month is Adhika (intercalary) when the Sun stays in the same
    Rashi across the whole month — i.e. no Sankranti (solar transit) falls
    between this new moon and the next one. That happens because a solar
    month (~30.44 days) is slightly longer than a lunar month (~29.53
    days), so roughly once every 32-33 months a lunar month "slips through"
    without a Sankranti; it's inserted as an extra month carrying the same
    name as the following (regular) month, which is why an Adhika-Masa year
    has two consecutive months with the same name.
    """
    jd_start = _julian_day_ut(start_nm_utc)
    sun_start, _ = _sun_moon_longitudes(jd_start)
    rashi_start = int(sun_start / 30)

    # start_nm_utc IS a new moon already, so searching from it directly would
    # just re-match that same instant (the coarse scan below accepts anything
    # within ~3 degrees of the target, which covers a few hours either side
    # of any exact crossing). Nudge a day forward first — safe here (unlike
    # at arbitrary reference points) because the next new moon is genuinely
    # ~29.5 days out, nowhere near this offset.
    end_nm_utc = _find_next_new_moon(start_nm_utc + timedelta(days=1))
    jd_end = _julian_day_ut(end_nm_utc)
    sun_end, _ = _sun_moon_longitudes(jd_end)
    rashi_end = int(sun_end / 30)

    is_adhika = rashi_start == rashi_end
    return (rashi_start + 1) % 12, is_adhika


@lru_cache(maxsize=64)
def _find_masa_start_new_moon(year: int, masa_idx: int, search_start_month: int) -> datetime:
    """UTC instant of the new moon that begins Amanta masa `masa_idx`,
    searching forward from `search_start_month` of `year` (skipping past
    any Adhika occurrence of the same masa_idx to land on the nija one)."""
    cur = datetime(year, search_start_month, 1, 12, 0, tzinfo=timezone.utc)
    nm_utc = _find_next_new_moon(cur)
    for _ in range(4):  # generous margin for an Adhika Masa inserted earlier that year
        m_idx, is_adhika = _masa_and_adhika(nm_utc)
        if m_idx == masa_idx and not is_adhika:
            return nm_utc
        nm_utc = _find_next_new_moon(nm_utc + timedelta(days=1))
    return nm_utc


def _find_tithi_span(masa_start_nm_utc: datetime, tithi_idx: int) -> tuple[datetime, datetime]:
    """UTC [start, end) instants of tithi `tithi_idx` within the lunar month
    that begins at masa_start_nm_utc (itself Pratipada/tithi_idx 0's start)."""
    if tithi_idx == 0:
        start = masa_start_nm_utc
    else:
        start = _find_moon_phase(masa_start_nm_utc + timedelta(hours=1), tithi_idx * 12.0, direction=1)
    end = _find_moon_phase(start + timedelta(hours=1), ((tithi_idx + 1) * 12.0) % 360, direction=1)
    return start, end


def _touched_civil_days(start_utc: datetime, end_utc: datetime, tz: timezone) -> list[date]:
    """Every local calendar date the [start_utc, end_utc) span touches at
    all — usually one day, but a tithi that starts mid-day and runs past
    midnight touches two, and a long tithi (vriddhi, up to ~26h) starting
    late enough in a day can touch three, fully covering the day in
    between. We show the festival on every day it touches rather than
    picking one "correct" day, since which single day classical sources
    treat as correct can itself vary by kaal/tradition/location."""
    d0 = start_utc.astimezone(tz).date()
    d1 = (end_utc - timedelta(microseconds=1)).astimezone(tz).date()
    days = []
    d = d0
    while d <= d1:
        days.append(d)
        d += timedelta(days=1)
    return days


# (key, masa_idx, tithi_idx, search_start_month) — masa_idx is Amanta
# convention (0=Chaitra); search_start_month anchors the new-moon search to
# well before the festival's typical month so it's found reliably even in
# years with an Adhika Masa shifting things later.
_TITHI_FESTIVALS = [
    ("ugadi",               0,  0, 2),
    ("rama_navami",         0,  8, 2),
    ("hanuman_jayanthi",    0, 14, 2),   # Chaitra Purnima
    ("narasimha_jayanthi",  1, 13, 3),   # Vaishakha Shukla Chaturdashi
    ("guru_pournami",       3, 14, 5),   # Ashadha Purnima
    ("polala_amavasya",     4, 29, 7),   # Shravana Amavasya
    ("naga_panchami",       4,  4, 7),
    ("raksha_bandhan",      4, 14, 7),
    ("krishna_janmashtami", 4, 22, 7),
    ("vinayaka_chavithi",   5,  3, 7),
    ("ganesh_nimajjanam",   5, 13, 7),
    ("maha_shivaratri",    10, 28, 1),
    ("holika_dahan",       11, 14, 1),   # Phalguna Purnima (bonfire night)
    ("holi",               11, 15, 1),   # Phalguna Krishna Pratipada (Rangwali Holi, the color-play day)
    ("atla_tadde",          6, 17, 9),   # Ashwina Krishna Tritiya
    ("naraka_chaturdashi",  6, 28, 9),
    ("diwali",              6, 29, 9),
    ("vijayadashami",       6,  9, 9),
    ("nagula_chavithi",     7,  3, 9),   # Karthika Shukla Chaturthi
    ("karthika_pournami",   7, 14, 9),
    # "Big" named Ekadashis (all Shukla Paksha, tithi_idx 10), each verified
    # against multiple external sources before adding:
    ("nirjala_ekadasi",     2, 10, 4),   # Jyeshtha Shukla Ekadashi
    ("toli_ekadasi",        3, 10, 5),   # Ashadha Shukla Ekadashi (Devshayani)
    ("chiluka_ekadasi",     7, 10, 9),   # Karthika Shukla Ekadashi (Utthana/Prabodhini)
    ("vaikuntha_ekadasi",   8, 10, 10),  # Margashirsha Shukla Ekadashi (Mokshada)
    ("gita_jayanthi",       8, 10, 10),  # Margashirsha Shukla Ekadashi (same day as Mokshada Ekadashi)
    ("bhishma_ekadasi",    10, 10, 1),   # Magha Shukla Ekadashi (Jaya)
]


@lru_cache(maxsize=8)
def _compute_tithi_spans_raw(year: int) -> dict[str, tuple[datetime, datetime]]:
    """Once per year, the [start, end) UTC span of every tithi-based
    festival — purely astronomical, so location-independent (unlike the
    civil days it lands on, which depend on timezone/sunrise/sunset)."""
    out = {}
    for key, masa_idx, tithi_idx, month in _TITHI_FESTIVALS:
        nm = _find_masa_start_new_moon(year, masa_idx, month)
        out[key] = _find_tithi_span(nm, tithi_idx)
    return out


def _drop_negligible_edge_days(
    days: list[date], start_utc: datetime, end_utc: datetime, lat: float, lon: float, tz: timezone,
) -> list[date]:
    """Trim a touched-days list of edge days where the tithi's presence is
    negligible: the last day if the tithi already ended before that day's
    sunrise (a pre-dawn sliver nobody would observe it on), and the first
    day if the tithi didn't start until after that day's sunset (a late-
    evening sliver that really belongs to the next day instead)."""
    if len(days) <= 1:
        return days
    loc = LocationInfo("here", "in", "UTC", lat, lon).observer
    last_sunrise = sun(loc, date=days[-1], tzinfo=tz)["sunrise"].astimezone(timezone.utc)
    if end_utc <= last_sunrise:
        days = days[:-1]
    if len(days) > 1:
        first_sunset = sun(loc, date=days[0], tzinfo=tz)["sunset"].astimezone(timezone.utc)
        if start_utc >= first_sunset:
            days = days[1:]
    return days


@lru_cache(maxsize=64)
def _compute_tithi_festival_spans(
    year: int, lat: float, lon: float, tz_offset_min: int,
) -> dict[str, dict[str, Any]]:
    """Per (year, location, tz): the [start, end) span and the touched
    civil day(s) — after trimming negligible sunrise/sunset edge slivers —
    for every tithi-based festival."""
    tz = timezone(timedelta(minutes=tz_offset_min))
    raw = _compute_tithi_spans_raw(year)
    out = {}
    for key, (start_utc, end_utc) in raw.items():
        days = _touched_civil_days(start_utc, end_utc, tz)
        days = _drop_negligible_edge_days(days, start_utc, end_utc, lat, lon, tz)
        out[key] = {
            "dates": days,
            "start_local": start_utc.astimezone(tz),
            "end_local": end_utc.astimezone(tz),
        }
    return out


@lru_cache(maxsize=16)
def _find_sankranti(year: int, target_rashi: int) -> date:
    """Civil date (IST) the Sun enters `target_rashi` (0=Mesha…11=Meena)
    during `year`, searched across the full year from Jan 1.
    """
    ist = timezone(timedelta(hours=5, minutes=30))
    cur = datetime(year, 1, 1, tzinfo=timezone.utc)
    step = timedelta(hours=12)
    prev_rashi = int(_sun_moon_longitudes(_julian_day_ut(cur))[0] / 30)
    for _ in range(732):  # ~366 days, covers any Sankranti in the year
        rashi = int(_sun_moon_longitudes(_julian_day_ut(cur))[0] / 30)
        if rashi == target_rashi and prev_rashi != target_rashi:
            lo, hi = cur - step, cur
            for _ in range(20):
                mid = lo + (hi - lo) / 2
                r = int(_sun_moon_longitudes(_julian_day_ut(mid))[0] / 30)
                if r == target_rashi:
                    hi = mid
                else:
                    lo = mid
            return hi.astimezone(ist).date()
        prev_rashi = rashi
        cur += step
    return cur.date()


def _find_prev_new_moon(dt_utc: datetime) -> datetime:
    return _find_moon_phase(dt_utc, target_diff=0.0, direction=-1)


def _find_next_new_moon(dt_utc: datetime) -> datetime:
    return _find_moon_phase(dt_utc, target_diff=0.0, direction=1)


def _find_prev_full_moon(dt_utc: datetime) -> datetime:
    return _find_moon_phase(dt_utc, target_diff=180.0, direction=-1)


def _tithi_idx_at(dt_utc: datetime) -> int:
    """Tithi index (0-29) at an arbitrary instant — generalizes the sunrise-only
    tithi calculation in compute_panchangam for kaal-based festival matching
    (Madhyahna/Nishita/Pradosh/Aparahna), where the governing instant isn't
    sunrise."""
    jd = _julian_day_ut(dt_utc)
    sun_lon, moon_lon = _sun_moon_longitudes(jd)
    diff = (moon_lon - sun_lon) % 360
    return int(diff / 12)


def _signed_phase_diff(dt_utc: datetime, target_diff: float) -> float:
    jd = _julian_day_ut(dt_utc)
    sun_lon, moon_lon = _sun_moon_longitudes(jd)
    d = (moon_lon - sun_lon) % 360
    return ((d - target_diff + 180) % 360) - 180


def _find_moon_phase(dt_utc: datetime, target_diff: float, direction: int) -> datetime:
    step = timedelta(hours=6) * direction
    cur = dt_utc
    for _ in range(240):
        signed = _signed_phase_diff(cur, target_diff)
        if abs(signed) < 3:
            # Bisect [cur-step, cur+step], which is guaranteed to bracket the
            # crossing (target is within 3° ≈ 5.5h of `cur`, well inside the
            # 6h step on either side). f_lo is evaluated once at the actual
            # `lo` endpoint and never touched again — comparing against a
            # freshly-recomputed `cur` (which is the *midpoint* of this
            # window, not an endpoint) on the first iteration silently
            # discarded half the bracket without ever checking it, which is
            # normally invisible but produces several minutes of jitter in
            # the returned instant depending on which coarse step triggered
            # the tolerance check. That jitter is usually harmless, but when
            # this new-moon/full-moon instant lands very close to an
            # unrelated 30° solar-rashi boundary (e.g. Adhika Masa's ending
            # new moon coinciding with a Sankranti), it can flip which side
            # of that boundary gets reported.
            lo, hi = cur - step, cur + step
            f_lo = _signed_phase_diff(lo, target_diff)
            for _ in range(30):
                mid = lo + (hi - lo) / 2
                f_mid = _signed_phase_diff(mid, target_diff)
                if f_mid * f_lo > 0:
                    lo, f_lo = mid, f_mid
                else:
                    hi = mid
            return lo + (hi - lo) / 2
        cur += step
    return dt_utc


def _moon_events(jd_start: float, lat: float, lon: float) -> tuple[datetime | None, datetime | None]:
    geopos = (lon, lat, 0.0)
    try:
        rise_res = eph.rise_trans(jd_start, Body.MOON, None, CalcFlags.SWIEPH, RiseSetFlags.RISE, geopos, 0.0, 0.0)
        rise_jd = rise_res.time if hasattr(rise_res, "time") else (rise_res[0] if isinstance(rise_res, tuple) else rise_res.data[0])
    except Exception:
        rise_jd = None

    try:
        set_res = eph.rise_trans(jd_start, Body.MOON, None, CalcFlags.SWIEPH, RiseSetFlags.SET, geopos, 0.0, 0.0)
        set_jd = set_res.time if hasattr(set_res, "time") else (set_res[0] if isinstance(set_res, tuple) else set_res.data[0])
    except Exception:
        set_jd = None

    def _to_dt(j):
        if j is None: return None
        j2000_epoch = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        return j2000_epoch + timedelta(days=(j - 2451545.0))

    return _to_dt(rise_jd), _to_dt(set_jd)


def compute_panchangam(target_date: date, lat: float, lon: float, tz_offset_min: int, calendar_type: str = "purnimanta") -> dict[str, Any]:
    tz = timezone(timedelta(minutes=tz_offset_min))

    loc = LocationInfo("here", "in", "UTC", lat, lon)
    try:
        s = sun(loc.observer, date=target_date, tzinfo=tz)
        sunrise = s["sunrise"]
        sunset = s["sunset"]
        solar_noon = s["noon"]
    except Exception:
        sunrise = datetime.combine(target_date, time(6, 0), tzinfo=tz)
        sunset = datetime.combine(target_date, time(18, 0), tzinfo=tz)
        solar_noon = datetime.combine(target_date, time(12, 0), tzinfo=tz)

    day_length_sec = (sunset - sunrise).total_seconds()
    day_len_h = int(day_length_sec // 3600)
    day_len_m = int((day_length_sec % 3600) // 60)

    sunrise_utc = sunrise.astimezone(timezone.utc)
    jd_sunrise = _julian_day_ut(sunrise_utc)
    sun_lon, moon_lon = _sun_moon_longitudes(jd_sunrise)

    diff = (moon_lon - sun_lon) % 360
    tithi_idx = int(diff / 12)
    tithi_name = TITHI_NAMES[tithi_idx]
    tithi_end_utc = _find_end_time(sunrise_utc, tithi_idx, 12.0, diff=True)
    paksha = PAKSHA_NAMES[0] if tithi_idx < 15 else PAKSHA_NAMES[1]
    next_tithi_name = TITHI_NAMES[(tithi_idx + 1) % 30]

    nakshatra_unit = 360.0 / 27
    nakshatra_idx = int(moon_lon / nakshatra_unit)
    nakshatra_name = NAKSHATRA_NAMES[nakshatra_idx]
    nakshatra_end_utc = _find_end_time(sunrise_utc, nakshatra_idx, nakshatra_unit, diff=False)

    yoga_val = (sun_lon + moon_lon) % 360
    yoga_idx = int(yoga_val / nakshatra_unit)
    yoga_name = YOGA_NAMES[yoga_idx]

    def _find_yoga_end():
        step = timedelta(minutes=5)
        cur = sunrise_utc
        end = sunrise_utc + timedelta(hours=30)
        prev = yoga_idx
        while cur < end:
            jd = _julian_day_ut(cur)
            sl, ml = _sun_moon_longitudes(jd)
            v = (sl + ml) % 360
            i = int(v / nakshatra_unit)
            if i != prev: return cur
            cur += step
        return end
    yoga_end_utc = _find_yoga_end()

    karana_full_idx = int(diff / 6)
    if karana_full_idx == 0:
        karana_name = KARANA_NAMES[10]
    elif karana_full_idx >= 57:
        karana_name = KARANA_NAMES[7 + (karana_full_idx - 57)]
    else:
        karana_name = KARANA_NAMES[(karana_full_idx - 1) % 7]
    karana_end_utc = _find_end_time(sunrise_utc, karana_full_idx, 6.0, diff=True)

    weekday = target_date.weekday()
    vara_name = VARA_NAMES[weekday]
    varam_vedic = VEDA_VARA_NAMES[weekday]

    tithi_festivals = _compute_tithi_festival_spans(target_date.year, lat, lon, tz_offset_min)
    ugadi_this_year = tithi_festivals["ugadi"]["dates"][0]
    samvatsara_start_year = target_date.year if target_date >= ugadi_this_year else target_date.year - 1
    sam_idx = (samvatsara_start_year - 2020 + 33) % 60
    samvatsara = SAMVATSARA_NAMES[sam_idx]

    # Ayanam follows the real sidereal Sun, not a fixed calendar-date
    # approximation: Uttarayanam begins the instant the Sun enters Makara
    # (Makara Sankranti) and Dakshinayanam begins when it enters Karka
    # (Karka Sankranti) — the same Sankranti finder used for Makara/Bhogi/
    # Kanuma below, just run a second time for the Karka boundary.
    makar_sankranti_date = _find_sankranti(target_date.year, 9)  # 9 = Makara rashi
    karka_sankranti_date = _find_sankranti(target_date.year, 3)  # 3 = Karka rashi
    ayanam = (
        AYANAM_NAMES[0]
        if makar_sankranti_date <= target_date < karka_sankranti_date
        else AYANAM_NAMES[1]
    )

    sun_rashi = int(sun_lon / 30)
    ritu_map = {
        0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5, 11: 5,
    }

    # Adhika Masa (the intercalary 13th lunar month, ~once every 32-33
    # months) is a lunar-calendar-only concept — Suryamana's months are
    # purely solar, so it never applies there.
    is_adhika_masa = False
    if calendar_type == "suryamana":
        masa_idx = sun_rashi
        masa = SOLAR_MASA_NAMES[masa_idx]
        masa_label = "Māsa (Sauramāna)"
    elif calendar_type == "amanta":
        prev_nm = _find_prev_new_moon(sunrise_utc)
        masa_idx, is_adhika_masa = _masa_and_adhika(prev_nm)
        masa = MASA_NAMES[masa_idx]
        masa_label = "Māsa (Amānta)"
    else:
        prev_fm = _find_prev_full_moon(sunrise_utc)
        next_nm = _find_next_new_moon(prev_fm)
        masa_idx, is_adhika_masa = _masa_and_adhika(next_nm)
        masa = MASA_NAMES[masa_idx]
        masa_label = "Māsa (Pūrṇimānta)"

    # Ritu follows whichever masa is actually being displayed, not the sun's
    # raw position — those two only line up when there's no Adhika Masa
    # currently shifting the lunar calendar relative to the solar one, which
    # doesn't hold most of the year (e.g. Adhika Jyeṣṭha this year pushed
    # Chandramana's masa names a full month behind Suryamana's).
    ritu = RITU_NAMES[ritu_map[masa_idx]]

    if is_adhika_masa:
        masa = {lang: f"{ADHIKA[lang]} {masa[lang]}" for lang in LANGS}

    # Festivals are all resolved to a fixed Amanta-anchored civil date per
    # year (above), independent of which calendar_type was requested, so a
    # festival's presence doesn't flicker depending on which calendar tab
    # the user has selected. `makar_sankranti_date` was already computed
    # above for Ayanam and is reused here.

    try:
        mrise_utc, mset_utc = _moon_events(jd_sunrise - 0.5, lat, lon)
        moonrise = mrise_utc.astimezone(tz) if mrise_utc else None
        moonset = mset_utc.astimezone(tz) if mset_utc else None
    except Exception:
        moonrise, moonset = None, None

    # --- Restore Astrological Kalas ---
    day_seg = (sunset - sunrise) / 8
    rk_i = RAHUKALAM_SEGMENT[weekday]
    yg_i = YAMAGANDA_SEGMENT[weekday]
    gk_i = GULIKA_SEGMENT[weekday]

    def _seg(i: int) -> tuple[datetime, datetime]:
        return sunrise + day_seg * (i - 1), sunrise + day_seg * i

    rahu_s, rahu_e = _seg(rk_i)
    yama_s, yama_e = _seg(yg_i)
    gulika_s, gulika_e = _seg(gk_i)

    # Brahma Muhurta is the 14th of the 15 muhurtas of the *night* (sunset
    # → next sunrise), i.e. it ends one night-muhurta before sunrise and
    # starts two before — scaled to the real night length, not a flat
    # 96/48 minutes (which only holds at the equinox).
    try:
        prev_sunset = sun(loc.observer, date=target_date - timedelta(days=1), tzinfo=tz)["sunset"]
    except Exception:
        prev_sunset = sunrise - timedelta(hours=12)
    night_muhurta = (sunrise - prev_sunset) / 15
    brahma_s = sunrise - night_muhurta * 2
    brahma_e = sunrise - night_muhurta

    muhurta_len = (sunset - sunrise) / 15
    abhijit_s = sunrise + muhurta_len * 7
    abhijit_e = sunrise + muhurta_len * 8

    # Varjyam and Amrita Kalam come from the Moon's nakshatra, not a fixed
    # clock offset from sunrise. Each nakshatra has its own start point for
    # each, in ghatis-from-nakshatra-start (out of 60); both spans last
    # 4 ghatis. Every fraction is scaled to the nakshatra's real duration,
    # and if a period has already ended before sunrise we roll forward to
    # the next nakshatra's occurrence.
    nakshatra_start_utc = _find_start_time(sunrise_utc, nakshatra_idx, nakshatra_unit, diff=False)

    def _nakshatra_kala(ghati_table: tuple[int, ...]) -> tuple[datetime, datetime]:
        idx, n_start, n_end = nakshatra_idx, nakshatra_start_utc, nakshatra_end_utc
        s = e = sunrise_utc
        for _ in range(3):
            span = n_end - n_start
            s = n_start + span * (ghati_table[idx] / 60.0)
            e = s + span * (4.0 / 60.0)
            if e >= sunrise_utc:
                break
            idx = (idx + 1) % 27
            n_start = n_end
            n_end = _find_end_time(n_start + timedelta(minutes=1), idx, nakshatra_unit, diff=False)
        return s, e

    varjyam_s, varjyam_e = _nakshatra_kala(NAKSHATRA_VARJYAM_GHATIS)
    amrita_s, amrita_e = _nakshatra_kala(NAKSHATRA_AMRITA_GHATIS)

    dur_periods = []
    for i in DUR_MUHURTA_INDICES.get(weekday, [12]):
        s0 = sunrise + muhurta_len * (i - 1)
        e0 = sunrise + muhurta_len * i
        dur_periods.append((s0, e0))

    def _till_dict(end_utc: datetime) -> dict[str, str]:
        end_local = end_utc.astimezone(tz)
        t = _fmt_time(end_local)
        # English fronts the word ("till 5:00 PM"); every other language here is a
        # postposition, following the time ("5:00 PM வரை" / "5:00 PM తక" style).
        is_tomorrow = end_local.date() > target_date
        out = {}
        for lang in LANGS:
            base = f"{TILL['en']} {t}" if lang == "en" else f"{t} {TILL[lang]}"
            out[lang] = f"{base} ({TOMORROW[lang]})" if is_tomorrow else base
        return out

    tithi_till = _till_dict(tithi_end_utc)
    nakshatra_till = _till_dict(nakshatra_end_utc)
    yoga_till = _till_dict(yoga_end_utc)
    karana_till = _till_dict(karana_end_utc)

    from panchangam.extended_panchangam import compute_extended
    extended = compute_extended(
        target_date, lat, lon, tz_offset_min,
        sunrise, sunset, jd_sunrise, weekday,
        tithi_idx, nakshatra_idx, karana_name["en"],
        makar_sankranti_date, tithi_festivals,
    )

    return {
        "date": target_date.strftime("%d/%m/%Y"),
        "weekday": weekday,
        "calendar_type": calendar_type,
        "general": {
            "samvatsara": samvatsara,
            "ayanam": ayanam,
            "ritu": ritu,
            "masa": masa,
            "masa_label": masa_label,
            "is_adhika_masa": is_adhika_masa,
            "paksha": paksha,
            "tithi": tithi_name,
            "tithi_till": tithi_till,
            "tithi_next": next_tithi_name,
            "vara": vara_name,
            "varam": varam_vedic,
            "nakshatra": nakshatra_name,
            "nakshatra_till": nakshatra_till,
            "yoga": yoga_name,
            "yoga_till": yoga_till,
            "karana": karana_name,
            "karana_till": karana_till
        },
        "solar": {
            "sunrise": _fmt_time(sunrise),
            "sunset": _fmt_time(sunset),
            "solar_noon": _fmt_time(solar_noon),
            "day_length": f"{day_len_h}h {day_len_m}m",
            "sunrise_iso": sunrise.isoformat(),
            "sunset_iso": sunset.isoformat(),
        },
        "lunar": {
            "moonrise": _fmt_time(moonrise) if moonrise else "—",
            "moonset": _fmt_time(moonset) if moonset else "—",
            "moon_illumination": round(50 * (1 - math.cos(math.radians(diff))), 1),
        },
        "kalas": {
            "brahma_muhurta": f"{_fmt_time(brahma_s.astimezone(tz))} – {_fmt_time(brahma_e.astimezone(tz))}",
            "abhijit_muhurta": f"{_fmt_time(abhijit_s.astimezone(tz))} – {_fmt_time(abhijit_e.astimezone(tz))}",
            "amrita_kala": f"{_fmt_time(amrita_s.astimezone(tz))} – {_fmt_time(amrita_e.astimezone(tz))}",
            "rahukalam": f"{_fmt_time(rahu_s.astimezone(tz))} – {_fmt_time(rahu_e.astimezone(tz))}",
            "yamaganda": f"{_fmt_time(yama_s.astimezone(tz))} – {_fmt_time(yama_e.astimezone(tz))}",
            "gulika": f"{_fmt_time(gulika_s.astimezone(tz))} – {_fmt_time(gulika_e.astimezone(tz))}",
            "durmuhurta": " / ".join(
                f"{_fmt_time(s.astimezone(tz))} – {_fmt_time(e.astimezone(tz))}"
                for s, e in dur_periods
            ),
            "varjyam": f"{_fmt_time(varjyam_s.astimezone(tz))} – {_fmt_time(varjyam_e.astimezone(tz))}",
        },
        "extended": extended,
    }