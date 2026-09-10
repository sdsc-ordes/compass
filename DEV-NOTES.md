# DEV NOTES

## Frontend related

- the `share/index.html` for local dev / build. Can we move this into tools somehow for the frontend? 
- nginx and index.html setup is frontend related for the frontend Docker. Will this stay or be reworked? Could it live in `src/frontend`?
- The script for `build-tiles.mjs` fails to fetch some tiles. Did not fix this for the moment.
- Indicate somewhere on the map that this is a `Beta` version. (with the Beta Version mention somewhere).

## Data Update 

- there should be an empty template `source-data.ods`, a `template-source-data.ods` if a new project wants to start. 

## Docs

- please read them, especially `configuration.md` and `design.md`.
- please read over the global README at root
- please read the backend READMEs

## Ontology/Semantics related

- Oceancare specifics and wordpress specifics. The other ontology PR addresses this. 
- Is the entire nomenclature (functions, documentation) for SHACL, SPARQL to geojson flows correct? Please check it.
- State of the tags on ESite API vs what is in the ontology. Please double check nothing is missing. 

| status | ontology_iri | property | ontology_id | expected_api_id | api_name | notes |
| --- | --- | --- | --- | --- | --- | --- |
| OK | compass:OceanNoisePollution | wpTagId | 142 | 142 | Unterwasserlärmverschmutzung | |
| OK | compass:PlasticPollution | wpTagId | 143 | 143 | Plastikverschmutzung | |
| OK | compass:DeepSeaMining | wpTagId | 145 | 145 | Tiefseebergbau | |
| OK | compass:Whales | wpTagId | 147 | 147 | Wale | |
| OK | compass:Dolphins | wpTagId | 148 | 148 | Delfine | |
| OK | compass:Seals | wpTagId | 149 | 149 | Robben | |
| OK | compass:ResearchExpeditions | wpTagId | 158 | 158 | Mitforschen | |
| OK | compass:Events | wpTagId | 425 | 425 | Veranstaltungen | |
| OK | compass:PolarBears | wpTagId | 429 | 429 | Eisbären | |
| OK | compass:Sharks | wpTagId | 433 | 433 | Haie | |
| OK | compass:Manatees | wpTagId | 436 | 436 | Manatis | |
| OK | compass:SeaTurtles | wpTagId | 437 | 437 | Meeresschildkröten | |
| OK | compass:RescueActivities | wpTagId | 440 | 440 | Tierrettung | |
| OK | compass:Petitions | wpTagId | 443 | 443 | Petitionen | |
| OK | compass:AquaticWildMeat | wpTagId | 445 | 445 | Aquatic Wild Meat | |
| OK | compass:ClimateProtection | wpTagId | 447 | 447 | Klimaschutz | |
| OK | compass:CommunityInvolvement | wpTagId | 451 | 451 | Aktiv werden | |
| OK | compass:SpeciesConservation | wpTagId | 455 | 455 | Artenschutz | |
| OK | ocinst:OceanCare | wpEntityTagId | 458 | 458 | OceanCare | |
| OK | ocinst:IWC | wpEntityTagId | 466 | 466 | IWC | |
| OK | compass:Collisions | wpTagId | 492 | 492 | Kollisionen | |
| OK | compass:FaroeIslands | wpTagId | 843 | 843 | Färöer-Inseln | |
| OK | compass:ChemicalPollution | wpTagId | 845 | 845 | Chemische Verschmutzung | |
| OK | compass:Shipping | wpTagId | 870 | 870 | Schifffahrt | |
| OK | ocinst:BBNJ | wpEntityTagId | 874 | 874 | BBNJ-Abkommen | |
| OK | compass:Geoengineering | wpTagId | 889 | 889 | Geoengineering | |
| OK | compass:Fisheries | wpTagId | 892 | 892 | Fischerei | |
| OK | ocinst:BecauseOurPlanetIsBlue | wpEntityTagId | 895 | 895 | Because Our Planet Is Blue | |
| OK | compass:Orcas | wpTagId | 897 | 897 | Orcas | |
| OK | compass:EuropeanUnion | wpTagId | 905 | 905 | Europäische Union | |
| OK | compass:FossilFuels | wpTagId | 906 | 906 | Fossile Brennstoffe | |
| OK | compass:OutOfHabitat | wpTagId | 907 | 907 | Out of Habitat | |
| OK | compass:Switzerland | wpTagId | 913 | 913 | Schweiz | |
| OK | compass:Fish | wpTagId | 918 | 918 | Fische | |
| MISMATCH | ocinst:SAVEWhales | wpEntityTagId | 921 | 900 | SAvE Whales | ontology has 921 (not in API); API tag is 900 |
| MISSING | compass:OceanConservation | wpTagId | | 144 | Meeresschutz | concept exists; no wpTagId |
| MISSING | compass:AdvocacyWork | wpTagId | | 146 | Advocacy Arbeit | concept exists; no wpTagId |
| MISSING | compass:ScientificResearch | wpTagId | | 962 | Wissenschaftliche Forschung | concept exists; no wpTagId |
| MISSING | compass:AnimalConservation | wpTagId | | 1070 | Tierschutz | concept exists; no wpTagId |
| MISSING | compass:Hunting | wpTagId | | 911 | Bejagung | concept exists; no wpTagId |
| MISSING | compass:SmallCetaceans | wpTagId | | 910 | Kleinwale | concept exists; no wpTagId |
| MISSING | compass:Corals | wpTagId | | 1068 | Korallen | concept exists; no wpTagId |
| MISSING | compass:Greece | wpTagId | | 942 | Griechenland | concept exists; no wpTagId |
| MISSING | compass:Italy | wpTagId | | 944 | Italien | concept exists; no wpTagId |
| MISSING | compass:Slovenia | wpTagId | | 946 | Slowenien | concept exists; no wpTagId |
| MISSING | compass:EasternMediterraneanSea | wpTagId | | 948 | Östliches Mittelmeer | concept exists; no wpTagId |
| MISSING | compass:Arctic | wpTagId | | 964 | Arktis | concept exists; no wpTagId |
| MISSING | compass:Australia | wpTagId | | 966 | Australien | concept exists; no wpTagId |
| MISSING | compass:Benin | wpTagId | | 968 | Benin | concept exists; no wpTagId |
| MISSING | compass:Bulgaria | wpTagId | | 970 | Bulgarien | concept exists; no wpTagId |
| MISSING | compass:Germany | wpTagId | | 972 | Deutschland | concept exists; no wpTagId |
| MISSING | compass:France | wpTagId | | 974 | Frankreich | concept exists; no wpTagId |
| MISSING | compass:UnitedKingdom | wpTagId | | 976 | Grossbritannien | concept exists; no wpTagId |
| MISSING | compass:Iceland | wpTagId | | 978 | Island | concept exists; no wpTagId |
| MISSING | compass:Japan | wpTagId | | 980 | Japan | concept exists; no wpTagId |
| MISSING | compass:Maldives | wpTagId | | 982 | Malediven | concept exists; no wpTagId |
| MISSING | compass:Mauritania | wpTagId | | 984 | Mauretanien | concept exists; no wpTagId |
| MISSING | compass:Norway | wpTagId | | 986 | Norwegen | concept exists; no wpTagId |
| MISSING | compass:BalticSea | wpTagId | | 988 | Ostsee | concept exists; no wpTagId |
| MISSING | compass:Spain | wpTagId | | 990 | Spanien | concept exists; no wpTagId |
| MISSING | compass:Venezuela | wpTagId | | 992 | Venezuela | concept exists; no wpTagId |
| MISSING | compass:WestAfrica | wpTagId | | 994 | Westafrika | concept exists; no wpTagId |
| MISSING | compass:WesternMediterraneanSea | wpTagId | | 996 | Westliches Mittelmeer | concept exists; no wpTagId |
| MISSING | compass:Austria | wpTagId | | 998 | Österreich | concept exists; no wpTagId |
| MISSING | | — | | 161 | Tipps | API only |
| MISSING | | — | | 441 | I Care | API only |
| MISSING | | — | | 859 | IUCN | API only |
| MISSING | | — | | 890 | Grundschleppnetze | API only |
| MISSING | | — | | 908 | Robbenjagd | API only |
| MISSING | | — | | 909 | Tourismus | API only |
| MISSING | | — | | 912 | UNO | API only |
| MISSING | | — | | 938 | Schifffahrt | API only (duplicate of 870, count=0) |
| MISSING | | — | | 950 | ACCOBAMS | API only (entity ocinst:ACCOBAMS exists, no wpEntityTagId) |
| MISSING | | — | | 952 | FAO/GFCM | API only |
| MISSING | | — | | 954 | Dolphin Biology and Conservation | API only |
| MISSING | | — | | 956 | FORTH | API only (entity exists, no wpEntityTagId) |
| MISSING | | — | | 958 | Morigenos | API only |
| MISSING | | — | | 960 | Tethys Research Institute | API only |
| MISSING | | — | | 1000 | ASCOBANS | API only (entity exists, no wpEntityTagId) |
| MISSING | | — | | 1002 | Abidjan-Konvention | API only |
| MISSING | | — | | 1004 | CBD | API only |
| MISSING | | — | | 1006 | CMS/Bonner Konvention | API only |
| MISSING | | — | | 1008 | EU-Kommission | API only |
| MISSING | | — | | 1010 | FAO/COFI | API only |
| MISSING | | — | | 1012 | IMO | API only |
| MISSING | | — | | 1014 | ISA | API only |
| MISSING | | — | | 1016 | LC/LP | API only |
| MISSING | | — | | 1018 | UN ECOSOC | API only |
| MISSING | | — | | 1020 | UNCLOS | API only |
| MISSING | | — | | 1022 | UNEP/GPML | API only |
| MISSING | | — | | 1024 | UNEP/MAP | API only |
| MISSING | | — | | 1026 | UNEP/UNEA | API only |
| MISSING | | — | | 1028 | UNFCCC | API only |
| MISSING | | — | | 1030 | UNOC | API only |
| MISSING | | — | | 1032 | Break Free From Plastic | API only |
| MISSING | | — | | 1034 | Deep Sea Conservation Coalition | API only |
| MISSING | | — | | 1036 | Global Ghost Gear Initiative | API only |
| MISSING | | — | | 1038 | High Seas Alliance | API only |
| MISSING | | — | | 1040 | Sea Turtle Rescue Alliance | API only |
| MISSING | | — | | 1042 | Seas at Risk | API only |
| MISSING | | — | | 1044 | Species Survival Network | API only |
| MISSING | | — | | 1046 | Alnitak Research Institute | API only |
| MISSING | | — | | 1048 | BDMLR | API only |
| MISSING | | — | | 1050 | BEES | API only |
| MISSING | | — | | 1052 | CBD-Hábitat | API only |
| MISSING | | — | | 1054 | CIT | API only |
| MISSING | | — | | 1056 | Green Balkans | API only |
| MISSING | | — | | 1058 | IDP | API only |
| MISSING | | — | | 1060 | LPA Calais | API only |
| MISSING | | — | | 1062 | ORP | API only |
| MISSING | | — | | 1064 | Pelagos Cetacean Research Institute | API only |
| MISSING | | — | | 1066 | iSea | API only |