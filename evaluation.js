"use strict";

// ============================================================
// CONFIGURATION
// ============================================================

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbykwu7C5pB3bbzu9-RM8L-oz0jypZIRBhr3VERjxz4BEHWvUNtT99NOht-k7QeXnKgP/exec";


const PILOT_RESULTS_URL = "./data/pilot_results.json";
const SYNTHETIC_PROFILES_URL = "./data/synthetic_profiles.json";

// ============================================================
// GLOBAL STATE
// ============================================================

let evaluationItems = [];
let currentIndex = 0;
let syntheticProfiles = null;
let syntheticProfilesError = null;
let participantCode = "";
let isSubmitting = false;

document.addEventListener("DOMContentLoaded", initialiseEvaluation);

// ============================================================
// INITIALISE
// ============================================================

async function initialiseEvaluation() {
  try {
    participantCode = localStorage.getItem("participantCode") || "";

    if (!participantCode) {
      window.location.href = "index.html";
      return;
    }

    // Check that the disfluency helper has loaded.
    if (
      typeof window.loadSyntheticProfiles !== "function" ||
      typeof window.renderTargetWordDisfluencies !== "function"
    ) {
      throw new Error(
        "disfluency-matching.js was not loaded. Check the script path and order in evaluation.html."
      );
    }

    // Load lyric data.
    const response = await fetch(PILOT_RESULTS_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `Could not load pilot_results.json: HTTP ${response.status}`
      );
    }

    const pilotResults = await response.json();

    evaluationItems = prepareEvaluationItems(pilotResults);

    if (!evaluationItems.length) {
      throw new Error("No lyric evaluation items were found.");
    }

    // Load synthetic profiles.
    // If this fails, the lyric evaluation can still continue.
    try {
      syntheticProfiles = await window.loadSyntheticProfiles(
        SYNTHETIC_PROFILES_URL
      );
    } catch (error) {
      console.error("Synthetic profile loading failed:", error);
      syntheticProfilesError = error;
    }

    shuffleArray(evaluationItems);

    attachFormHandler();
    displayItem();

  } catch (error) {
    console.error("Initialisation error:", error);
    showPageError(error.message);
  }
}

// ============================================================
// PREPARE EVALUATION ITEMS
// ============================================================

function prepareEvaluationItems(data) {
  let items = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (Array.isArray(data.generations)) {
    items = data.generations;
  } else if (Array.isArray(data.results)) {
    items = data.results;
  } else if (Array.isArray(data.lyrics)) {
    items = data.lyrics;
  }

  return items
    .filter(item =>
      item && (item.lyric || item.lyrics || item.final_lyric)
    )
    .map((item, index) => {

      const childProfile =
        item.child_profile || item.profile || {};

      const lyrics =
        item.lyric ??
        item.lyrics ??
        item.final_lyric ??
        "";

      const childId =
        item.child_id ??
        childProfile.child_id ??
        item.childId ??
        "";

      const recordingId =
        item.recording_id ??
        childProfile.recording_id ??
        item.recordingId ??
        "";

      const targetWords = normaliseTargetWords(
        item.evaluation_target_words ??
        item.target_words ??
        childProfile.target_words ??
        []
      );

      const promptTargetWords = normaliseTargetWords(
        item.prompt_target_words ??
        item.prompt_target_words_list ??
        []
      );

      return {
        id:
          item.id ??
          `${childId}_${recordingId}_${item.condition || ""}_${item.model || ""}_${item.seed ?? index}`,

        dataset: item.dataset ?? item.source_dataset ?? "",

        child_id: childId,
        recording_id: recordingId,

        age: item.age ?? childProfile.age ?? "",

        interests:
          item.interests ??
          childProfile.interests ??
          childProfile.child_interests ??
          [],

        target_words: targetWords,
        prompt_target_words: promptTargetWords,

        condition:
          item.condition ??
          item.prompt_condition ??
          "",

        model:
          item.model ??
          item.model_name ??
          "",

        seed: item.seed ?? "",

        prompt:
          item.prompt ??
          item.prompt_text ??
          "",

        lyrics: String(lyrics),

        raw_metadata: item
      };
    });
}

// ============================================================
// NORMALISE TARGET WORDS
// ============================================================

function normaliseTargetWords(value) {
  if (Array.isArray(value)) {
    return value
      .flat(Infinity)
      .map(word => String(word).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map(word => word.trim())
      .filter(Boolean);
  }

  return [];
}

// ============================================================
// FORM HANDLER
// ============================================================

function attachFormHandler() {
  const form = document.getElementById("evaluationForm");

  if (!form) {
    throw new Error(
      'Could not find the form with id="evaluationForm".'
    );
  }

  if (form.dataset.handlerAttached === "true") return;

  form.addEventListener("submit", handleFormSubmit);
  form.dataset.handlerAttached = "true";
}

// ============================================================
// DISPLAY LYRIC
// ============================================================

function displayItem() {
  const item = evaluationItems[currentIndex];

  if (!item) {
    finishEvaluation();
    return;
  }

  setText(
    "progress",
    `Lyric ${currentIndex + 1} of ${evaluationItems.length}`
  );

  setText(
    "childAge",
    item.age ? String(item.age) : "Not specified"
  );

  const interestsText = Array.isArray(item.interests)
    ? item.interests.join(", ")
    : String(item.interests || "");

  setText(
    "childInterests",
    interestsText || "Not specified"
  );

  setText(
    "targetWords",
    item.target_words.length
      ? item.target_words.join(", ")
      : "No target words supplied"
  );

  const lyricElement = document.getElementById("lyrics");

  if (lyricElement) {
    lyricElement.innerHTML = formatLyrics(item.lyrics);
  }

  // Display target words and their associated disfluency types.
  const targetContainer =
    document.getElementById("targetDisfluencies");

  if (targetContainer) {
    targetContainer.innerHTML = "";

    if (syntheticProfilesError) {
      targetContainer.textContent =
        "Disfluency information could not be loaded. Please notify the study team.";

    } else if (syntheticProfiles) {

      const recordForMatching = {
        child_id: item.child_id,
        recording_id: item.recording_id,
        condition: item.condition,
        target_words: item.target_words,
        final_lyric: item.lyrics
      };

      try {
        window.renderTargetWordDisfluencies(
          recordForMatching,
          syntheticProfiles
        );

        // Show disfluency types as "word repetition", not "word_repetition".
        formatDisfluencyLabels(targetContainer);
      } catch (error) {
        console.error("Disfluency matching error:", error);

        targetContainer.textContent =
          "Disfluency information could not be displayed.";
      }
    }
  }

  const form = document.getElementById("evaluationForm");

  if (form) {
    form.reset();
  }

  isSubmitting = false;
  setSubmitState(false);
}

// ============================================================
// DISFLUENCY LABEL FORMATTING
// ============================================================

function formatDisfluencyLabels(container) {
  const table = container.querySelector("table");

  if (!table) return;

  Array.from(table.querySelectorAll("tr")).slice(1).forEach(row => {
    const cell = row.querySelectorAll("th, td")[1];

    if (!cell) return;

    const walker = document.createTreeWalker(
      cell,
      NodeFilter.SHOW_TEXT
    );

    let node;

    while ((node = walker.nextNode())) {
      node.nodeValue = node.nodeValue.replace(/_/g, " ");
    }
  });
}

// ============================================================
// FORMATTING
// ============================================================

function formatLyrics(text) {
  return escapeHtml(String(text || ""))
    .replace(/\r?\n/g, "<br>");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

// ============================================================
// COLLECT DISPLAYED DISFLUENCY INFORMATION
// ============================================================

function collectDisplayedDisfluencies() {
  const container =
    document.getElementById("targetDisfluencies");

  if (!container) return [];

  const table = container.querySelector("table");

  if (!table) {
    return [];
  }

  const rows = Array.from(
    table.querySelectorAll("tr")
  );

  return rows.slice(1).map(row => {
    const cells = Array.from(
      row.querySelectorAll("th, td")
    );

    return {
      target_word: cells[0]?.innerText.trim() || "",
      disfluency_type: cells[1]?.innerText.trim() || ""
    };
  }).filter(item =>
    item.target_word || item.disfluency_type
  );
}

// ============================================================
// BUILD SUBMISSION RECORD
// ============================================================

function buildSubmissionRecord(formData) {
  const item = evaluationItems[currentIndex];

  const getValue = name => {
    const value = formData.get(name);
    return value === null ? "" : String(value);
  };

  // Everything is flattened to plain text/numbers so that each value
  // fits in a single Google Sheet cell.
  const interests = Array.isArray(item.interests)
    ? item.interests.join(", ")
    : String(item.interests || "");

  const evaluationTargetWords = item.target_words.join(", ");

  const promptTargetWords = (item.prompt_target_words || []).join(", ");

  const disfluencies = collectDisplayedDisfluencies()
    .map(entry => `${entry.target_word}: ${entry.disfluency_type}`)
    .join("; ");

  // The keys below must match the column headers in the Google Sheet.
  return {

    // Submission information
    timestamp: new Date().toISOString(),
    submission_id: createSubmissionId(),
    participant_code: participantCode,

    // Item information
    item_id: item.id,
    dataset: item.dataset,
    child_id: item.child_id,
    recording_id: item.recording_id,
    condition: item.condition,
    model: item.model,
    seed: item.seed,

    // Child information
    age: item.age,
    interests: interests,

    // Target-word information
    evaluation_target_words: evaluationTargetWords,
    prompt_target_words: promptTargetWords,
    target_word_disfluencies: disfluencies,

    // Generated lyric
    lyric: item.lyrics,

    // Evaluation ratings
    age_appropriateness:
      getValue("age_appropriateness"),

    linguistic_simplicity:
      getValue("linguistic_simplicity"),

    personalisation:
      getValue("personalisation"),

    target_word_integration:
      getValue("target_word_integration"),

    naturalness:
      getValue("naturalness"),

    coherence:
      getValue("coherence"),

    children_song_suitability:
      getValue("children_song_suitability"),

    therapeutic_usefulness:
      getValue("therapeutic_usefulness"),

    overall_rating:
      getValue("overall_rating"),

    rmt_readiness:
      getValue("rmt_readiness"),

    comments:
      getValue("comments")
  };
}

function createSubmissionId() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return `sub_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 11)}`;
}

// ============================================================
// GOOGLE SHEETS SUBMISSION
// ============================================================

async function sendToGoogleSheet(record) {

  if (
    !GOOGLE_SCRIPT_URL ||
    !GOOGLE_SCRIPT_URL.includes("/exec")
  ) {
    throw new Error(
      "Google Apps Script URL is not configured."
    );
  }

  /*
   * text/plain avoids the browser's JSON CORS preflight.
   *
   * The Apps Script doPost(e) function must parse:
   * JSON.parse(e.postData.contents)
   *
   * IMPORTANT:
   * no-cors responses are opaque. The browser cannot read the
   * server response or verify that the spreadsheet append worked.
   */

  return fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    redirect: "follow",

    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },

    body: JSON.stringify(record)
  });
}

// ============================================================
// SUBMIT EVALUATION
// ============================================================

async function handleFormSubmit(event) {
  event.preventDefault();

  if (isSubmitting) return;

  const form = event.currentTarget;

  if (!form.reportValidity()) return;

  isSubmitting = true;
  setSubmitState(true, "Submitting...");

  const formData = new FormData(form);
  const submission = buildSubmissionRecord(formData);

  try {

    await sendToGoogleSheet(submission);

    // Local backup for recovery purposes.
    storeLocalSubmission(submission);

    currentIndex++;

    if (currentIndex >= evaluationItems.length) {
      finishEvaluation();
    } else {
      displayItem();
    }

  } catch (error) {

    console.error("Submission failed:", error);

    isSubmitting = false;
    setSubmitState(false);

    showSubmissionError(
      "We could not send your evaluation. Please check your internet connection and try again. Your answers are still on this page."
    );
  }
}

// ============================================================
// LOCAL BACKUP
// ============================================================

function storeLocalSubmission(record) {
  try {
    const key = "lyricEvaluationSubmissionBackup";

    const existing = JSON.parse(
      localStorage.getItem(key) || "[]"
    );

    existing.push(record);

    localStorage.setItem(
      key,
      JSON.stringify(existing)
    );

  } catch (error) {
    console.warn(
      "Could not save local backup:",
      error
    );
  }
}

// ============================================================
// BUTTON STATE
// ============================================================

function setSubmitState(disabled, buttonText) {
  const button = document.querySelector(
    '#evaluationForm button[type="submit"], #evaluationForm input[type="submit"]'
  );

  if (!button) return;

  button.disabled = disabled;

  if (buttonText) {

    if (button.tagName === "INPUT") {
      button.value = buttonText;

    } else {
      if (!button.dataset.originalText) {
        button.dataset.originalText =
          button.textContent;
      }

      button.textContent = buttonText;
    }

  } else if (button.dataset.originalText) {
    button.textContent =
      button.dataset.originalText;
  }
}

// ============================================================
// ERROR DISPLAY
// ============================================================

function showPageError(message) {
  let element =
    document.getElementById("evaluationError");

  if (!element) {
    element = document.createElement("div");

    element.id = "evaluationError";
    element.setAttribute("role", "alert");

    element.style.cssText =
      "padding:12px;margin:16px 0;border:1px solid #c33;border-radius:8px;color:#9b1c1c;background:#fff5f5;";

    document.body.prepend(element);
  }

  element.textContent = message;
}

function showSubmissionError(message) {
  let element =
    document.getElementById("submissionError");

  if (!element) {
    element = document.createElement("p");

    element.id = "submissionError";
    element.setAttribute("role", "alert");

    element.style.cssText =
      "color:#a11;margin-top:12px;";

    const form =
      document.getElementById("evaluationForm");

    if (form) {
      form.appendChild(element);
    }
  }

  element.textContent = message;
}

// ============================================================
// COMPLETION
// ============================================================

function finishEvaluation() {
  const form =
    document.getElementById("evaluationForm");

  if (form) {
    form.style.display = "none";
  }

  const content =
    document.getElementById("evaluationContent");

  if (content) {
    content.style.display = "none";
  }

  const completion =
    document.getElementById("completionMessage");

  if (completion) {
    completion.style.display = "block";

  } else {
    document.body.innerHTML = `
      <main style="max-width:700px;margin:60px auto;padding:24px;text-align:center;">
        <h1>Thank you!</h1>
        <p>Your evaluations have been submitted. Thank you for contributing to this study.</p>
      </main>
    `;
  }
}

// ============================================================
// SHUFFLE
// ============================================================

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [
      array[j],
      array[i]
    ];
  }
}
