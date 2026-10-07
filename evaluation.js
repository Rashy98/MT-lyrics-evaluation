const GOOGLE_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwfrsNCa1xh_rjRqQPdNHZBXU7jEndp_ZNCDoAoltaxabPziAXO4Jq_WRr6S6Kv6IqF/exec";


// ============================================================
// CONFIGURATION
// ============================================================

// Pilot-generated lyrics
const PILOT_RESULTS_URL =
    "data/pilot_results.json";


let evaluationItems = [];
let currentIndex = 0;
let responses = [];


// ============================================================
// START
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    initialiseEvaluation
);


async function initialiseEvaluation() {

    const participantCode =
        localStorage.getItem("participantCode");

    if (!participantCode) {
        window.location.href = "index.html";
        return;
    }

    try {

        console.log(
            "Loading pilot results from:",
            PILOT_RESULTS_URL
        );

        const response =
            await fetch(PILOT_RESULTS_URL, {
                cache: "no-store"
            });


        // ----------------------------------------------------
        // Check HTTP response
        // ----------------------------------------------------

        if (!response.ok) {

            throw new Error(
                `Unable to load pilot results: HTTP ${response.status} ${response.statusText}`
            );

        }


        // ----------------------------------------------------
        // Read JSON
        // ----------------------------------------------------

        let pilotResults;

        try {

            pilotResults =
                await response.json();

        }
        catch (jsonError) {

            throw new Error(
                "pilot_results.json was found, but it is not valid JSON. " +
                jsonError.message
            );

        }


        console.log(
            "Pilot results loaded:",
            pilotResults
        );


        // ----------------------------------------------------
        // Prepare evaluation items
        // ----------------------------------------------------

        evaluationItems =
            prepareEvaluationItems(
                pilotResults
            );


        console.log(
            "Evaluation items prepared:",
            evaluationItems.length
        );


        if (!evaluationItems.length) {

            throw new Error(
                "pilot_results.json loaded successfully, " +
                "but no valid lyrics were found."
            );

        }


        // ----------------------------------------------------
        // Randomise
        // ----------------------------------------------------

        evaluationItems =
            shuffle(
                evaluationItems
            );


        currentIndex = 0;


        // ----------------------------------------------------
        // Display first item
        // ----------------------------------------------------

        displayItem();

    }

    catch (error) {

        console.error(
            "FULL EVALUATION ERROR:",
            error
        );


        alert(
            "Unable to load the pilot evaluation items.\n\n" +
            error.message +
            "\n\nCheck the browser console (F12) for details."
        );

    }
}


// ============================================================
// PREPARE PILOT RESULTS
// ============================================================

function prepareEvaluationItems(
    pilotResults
) {

    /*
     Expected structure:

     [
       {
         "child_id": "F_0101",
         "recording_id": "F_0101_10y4m_1",
         "dataset": "uclass",
         "condition": "P1",
         "model": "qwen2.5:7b",
         "seed": 42,
         "age": "10y4m",
         "interests": [
           "fairy tales",
           "robots"
         ],
         "prompt": "...",
         "lyric": "Title: Rainbow Friends..."
       }
     ]

     The function also supports:

     {
       "generations": [...]
     }

     or:

     {
       "results": [...]
     }
    */


    let results = pilotResults;


    // --------------------------------------------------------
    // Handle wrapped "generations" structure
    // --------------------------------------------------------

    if (
        pilotResults &&
        Array.isArray(
            pilotResults.generations
        )
    ) {

        results =
            pilotResults.generations;

    }


    // --------------------------------------------------------
    // Handle wrapped "results" structure
    // --------------------------------------------------------

    else if (
        pilotResults &&
        Array.isArray(
            pilotResults.results
        )
    ) {

        results =
            pilotResults.results;

    }


    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!Array.isArray(results)) {

        console.error(
            "Pilot results are not an array:",
            results
        );

        return [];

    }


    // --------------------------------------------------------
    // Convert each generation into an evaluation item
    // --------------------------------------------------------

    return results

        .filter(
            item =>
                item &&
                (
                    item.lyric ||
                    item.lyrics
                )
        )

        .map(
            (item, index) => {

                /*
                 * IMPORTANT:
                 *
                 * The current pilot JSON uses:
                 *
                 * item.lyric
                 *
                 * rather than:
                 *
                 * item.lyrics
                 *
                 */

                const lyric =
                    item.lyric ||
                    item.lyrics ||
                    "";


                // ------------------------------------------------
                // Generate a stable evaluation ID
                // ------------------------------------------------

                const evaluationId =
                    item.id ||
                    [
                        item.child_id || "child",
                        item.recording_id || "recording",
                        item.condition || "condition",
                        item.model || "model",
                        item.seed ?? index
                    ].join("_");


                // ------------------------------------------------
                // Child age
                // ------------------------------------------------

                const age =
                    item.age ||
                    item.child_profile?.age ||
                    "Not specified";


                // ------------------------------------------------
                // Child interests
                // ------------------------------------------------

                let interests =
                    item.interests ||
                    item.child_profile?.interests ||
                    [];


                // Make sure interests is always an array

                if (!Array.isArray(interests)) {

                    interests =
                        interests
                            ? [interests]
                            : [];

                }


                // ------------------------------------------------
                // Target words
                // ------------------------------------------------
                //
                // The current pilot JSON does NOT contain
                // target_words.
                //
                // We therefore support it if it appears later,
                // but default to an empty array.
                //

                let targetWords =
                    item.target_words ||
                    item.child_profile?.target_words ||
                    [];


                if (!Array.isArray(targetWords)) {

                    targetWords =
                        targetWords
                            ? [targetWords]
                            : [];

                }


                // ------------------------------------------------
                // Return normalised evaluation item
                // ------------------------------------------------

                return {

                    // Unique evaluation ID

                    id:
                        evaluationId,


                    // ------------------------------------------------
                    // Dataset metadata
                    // ------------------------------------------------

                    dataset:
                        item.dataset ||
                        null,


                    // ------------------------------------------------
                    // Child metadata
                    // ------------------------------------------------

                    child_id:
                        item.child_id ||
                        item.child_profile?.child_id ||
                        null,


                    recording_id:
                        item.recording_id ||
                        item.child_profile?.recording_id ||
                        null,


                    age:
                        age,


                    interests:
                        interests,


                    target_words:
                        targetWords,


                    // ------------------------------------------------
                    // Generation metadata
                    // ------------------------------------------------

                    condition:
                        item.condition ||
                        item.prompt_condition ||
                        null,


                    model:
                        item.model ||
                        item.model_name ||
                        null,


                    seed:
                        item.seed ??
                        null,


                    // ------------------------------------------------
                    // Original prompt
                    // ------------------------------------------------
                    //
                    // Stored for analysis but NOT displayed
                    // to participants.
                    //

                    prompt:
                        item.prompt ||
                        null,


                    // ------------------------------------------------
                    // Generated lyrics
                    // ------------------------------------------------

                    lyrics:
                        lyric

                };

            }
        );

}


// ============================================================
// RANDOMISE
// ============================================================

function shuffle(array) {

    const copy =
        [...array];


    for (
        let i = copy.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() *
                (i + 1)
            );


        [
            copy[i],
            copy[j]
        ] = [
            copy[j],
            copy[i]
        ];

    }


    return copy;

}


// ============================================================
// DISPLAY ITEM
// ============================================================

function displayItem() {

    const item =
        evaluationItems[currentIndex];


    // --------------------------------------------------------
    // Progress
    // --------------------------------------------------------

    document.getElementById(
        "progress"
    ).textContent =
        `Evaluation ${currentIndex + 1} of ${evaluationItems.length}`;


    // --------------------------------------------------------
    // Child age
    // --------------------------------------------------------

    document.getElementById(
        "childAge"
    ).textContent =
        item.age;


    // --------------------------------------------------------
    // Child interests
    // --------------------------------------------------------

    document.getElementById(
        "childInterests"
    ).textContent =
        item.interests.length
            ? item.interests.join(", ")
            : "None specified";


    // --------------------------------------------------------
    // Target words
    // --------------------------------------------------------
    //
    // If the HTML contains targetWords, display them.
    //

    const targetWordsElement =
        document.getElementById(
            "targetWords"
        );


    if (targetWordsElement) {

        targetWordsElement.textContent =
            item.target_words.length
                ? item.target_words.join(", ")
                : "None specified";

    }


    // --------------------------------------------------------
    // Lyrics
    // --------------------------------------------------------

    document.getElementById(
        "lyrics"
    ).innerHTML =
        formatLyrics(
            item.lyrics
        );


    // --------------------------------------------------------
    // Clear evaluation form
    // --------------------------------------------------------

    document
        .getElementById(
            "evaluationForm"
        )
        .reset();

}


// ============================================================
// FORMAT LYRICS
// ============================================================

function formatLyrics(text) {

    return escapeHTML(
        text || ""
    )
        .replace(
            /\n/g,
            "<br>"
        );

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHTML(text) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        text;


    return div.innerHTML;

}


// ============================================================
// SUBMIT
// ============================================================

document
    .getElementById(
        "evaluationForm"
    )
    .addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            const form =
                event.target;


            // ------------------------------------------------
            // Validate
            // ------------------------------------------------

            if (!form.checkValidity()) {

                document
                    .getElementById(
                        "submitError"
                    )
                    .classList.remove(
                        "hidden"
                    );


                form.reportValidity();


                return;

            }


            document
                .getElementById(
                    "submitError"
                )
                .classList.add(
                    "hidden"
                );


            const item =
                evaluationItems[
                    currentIndex
                ];


            const formData =
                new FormData(
                    form
                );


            // ------------------------------------------------
            // Save response
            // ------------------------------------------------

            const responseData = {

                // ------------------------------------------------
                // Participant
                // ------------------------------------------------

                participant_code:
                    localStorage.getItem(
                        "participantCode"
                    ),


                // ------------------------------------------------
                // Evaluation item
                // ------------------------------------------------

                item_id:
                    item.id,


                // ------------------------------------------------
                // Dataset
                // ------------------------------------------------

                dataset:
                    item.dataset,


                // ------------------------------------------------
                // Generation metadata
                // ------------------------------------------------

                child_id:
                    item.child_id,


                recording_id:
                    item.recording_id,


                condition:
                    item.condition,


                model:
                    item.model,


                seed:
                    item.seed,


                // ------------------------------------------------
                // Child information
                // ------------------------------------------------

                age:
                    item.age,


                interests:
                    item.interests.join(
                        ", "
                    ),


                target_words:
                    item.target_words.join(
                        ", "
                    ),


                // ------------------------------------------------
                // Ratings
                // ------------------------------------------------

                age_appropriateness:
                    formData.get(
                        "age_appropriateness"
                    ),


                linguistic_simplicity:
                    formData.get(
                        "linguistic_simplicity"
                    ),


                personalisation:
                    formData.get(
                        "personalisation"
                    ),


                target_word_integration:
                    formData.get(
                        "target_word_integration"
                    ),


                naturalness:
                    formData.get(
                        "naturalness"
                    ),


                coherence:
                    formData.get(
                        "coherence"
                    ),


                children_song_suitability:
                    formData.get(
                        "children_song_suitability"
                    ),


                therapeutic_usefulness:
                    formData.get(
                        "therapeutic_usefulness"
                    ),


                overall_rating:
                    formData.get(
                        "overall_rating"
                    ),


                comments:
                    formData.get(
                        "comments"
                    ),


                // ------------------------------------------------
                // Timestamp
                // ------------------------------------------------

                timestamp:
                    new Date().toISOString()

            };


            // ------------------------------------------------
            // Store response locally
            // ------------------------------------------------

            responses.push(
                responseData
            );


            // ------------------------------------------------
            // Next item
            // ------------------------------------------------

            currentIndex++;


            if (
                currentIndex >=
                evaluationItems.length
            ) {

                await submitAllResponses();

                return;

            }


            displayItem();


            window.scrollTo(
                0,
                0
            );

        }
    );


// ============================================================
// SEND RESPONSES
// ============================================================

async function submitAllResponses() {

    try {

        for (
            const response of responses
        ) {

            await fetch(
                GOOGLE_SCRIPT_URL,
                {

                    method:
                        "POST",


                    mode:
                        "no-cors",


                    headers: {

                        "Content-Type":
                            "application/json"

                    },


                    body:
                        JSON.stringify(
                            response
                        )

                }
            );

        }


        // ----------------------------------------------------
        // Finished
        // ----------------------------------------------------

        window.location.href =
            "thankyou.html";

    }

    catch (error) {

        console.error(
            "Submission error:",
            error
        );


        alert(
            "There was a problem submitting the evaluation. " +
            "Please contact the researcher."
        );

    }

}