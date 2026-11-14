# Chatbot – vidensbaseret informationsassistent

Chatbotten er en statisk løsning, der hostes sammen med hjemmesiden på GitHub Pages. Den første version søger i en automatisk genereret vidensdatabase og viser kildebaserede tekstuddrag. Den bruger ikke en betalt AI-API eller en ekstern backend.

## Struktur
- `config/`: styring af hvilke kilder der må indgå.
- `data/`: genereret vidensdatabase.
- `../assets/js/chatbot.js` og `../assets/css/chatbot.css`: brugergrænseflade og styling.
- `../scripts/chatbot/`: generator og validering.
- `../.github/workflows/update-chatbot-knowledge.yml`: automatisk opdatering.

Læs denne README og undermappernes README før ændringer. Chatbotten må gengive kilder, men må ikke selv fortolke, ændre eller opfinde foreningens regler. Ved uklare eller modstridende kilder skal den tydeligt gøre opmærksom på usikkerheden og henvise til bestyrelsen.


## Sådan finder chatbotten svar

- Vidensdatabasen bygges fra kilderne i `config/knowledge-config.json`.
- Husordenens nummererede punkter gemmes hver for sig med punktnummer og PDF-side. Det forhindrer, at punkt 6 om husdyr blandes sammen med fx punkt 9 om fodring af dyr.
- Frontenden bruger danske synonymer og emnegenkendelse til at finde relevante afsnit. Kendte emner som husdyr, fodring, støj/nattero og parkering prioriterer det relevante kildeafsnit.
- Ved første åbning vises en emnemenu med parkering, vedtægter, husorden, kontakt, kælderrum, nøglebrikker, nyheder og generelle spørgsmål. Hvert emne har forslag til typiske spørgsmål. Forslagene er genveje – et valgt emne begrænser aldrig den efterfølgende søgning.
- De generelle spørgsmål om chatbotten har korte, prædefinerede svar i `PREDEFINED_ANSWERS` i `assets/js/chatbot.js`. Spørgsmål om foreningens forhold bruger fortsat den almindelige kildebaserede søgning.
- Emnenavne og forslag vedligeholdes i `TOPICS` i `assets/js/chatbot.js`. Tilføj kun spørgsmål, som kan besvares ud fra de inkluderede kilder.
- Knappernes tekstfarve er sort for at sikre kontrast på de røde og hvide knapper.
- Parkeringssiden opdeles i overblik, venteliste og uretmæssig parkering. Kontaktformularens felter indekseres ikke som viden.
- Chatbotten viser et kort, kildebaseret svar og den mest relevante kilde. PDF-links åbner på den registrerede side.
- Chatbotten bruger hjemmesidens røde accentfarve (`#f56a6a`) sammen med hvid og neutral grå – ikke grønne farver.
- Synonymer og emnegenkendelse er kun søgehjælp. De giver ikke chatbotten ret til at udlede nye regler. Selve ordlyden kommer fra kilden.
- Hvis der ikke findes et tilstrækkeligt relevant afsnit, svarer chatbotten, at den ikke kan finde et sikkert svar, og henviser til bestyrelsen.
- Regressionstest af de vigtigste spørgsmål kan køres fra repository-roden med `node scripts/chatbot/test-chatbot.js`.

## Vigtigt ved ændringer

Når husordenen eller andre kilder ændres, skal vidensdatabasen bygges igen via workflowet. Kontroller altid, at hvert svar linker til det rigtige dokument og punkt. Chatbotten må aldrig ændre de officielle dokumenter eller selv godkende foreslåede regelændringer.
