/*
 * disfluency-matching.js
 *
 * Matches target words in generated lyrics to their disfluency
 * types in synthetic_profiles.json.
 *
 * Expected lyric record:
 * {
 *   child_id,
 *   recording_id,
 *   condition,
 *   target_words,
 *   final_lyric
 * }
 *
 * Expected synthetic profiles:
 * {
 *   "profiles": [
 *     {
 *       "child_id": "...",
 *       "recording_id": "...",
 *       "disfluency_events": [
 *         {
 *           "type": "word_repetition",
 *           "target_word": "hello",
 *           "observed_target_word": "hello",
 *           "source_words": ["hello"],
 *           "normalized_words": ["hello"]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

(function () {
    "use strict";

    let cachedProfilesPromise = null;

    // Normalise words for matching.
    function normalizeToken(value) {
        if (value === null || value === undefined) return "";

        return String(value)
            .normalize("NFKC")
            .toLocaleLowerCase()
            .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
            .trim();
    }

    // Extract individual words from generated lyrics.
    function lyricTokens(text) {
        return String(text || "")
            .normalize("NFKC")
            .toLocaleLowerCase()
            .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
    }

    // Check whether a target word actually occurs in the lyrics.
    function targetOccursInLyrics(target, lyrics) {
        const targetToken = normalizeToken(target);

        if (!targetToken) return false;

        const tokens = new Set(
            lyricTokens(lyrics).map(normalizeToken)
        );

        return tokens.has(targetToken);
    }

    // Support either an array or an object containing profiles.
    function getProfilesArray(profilesData) {
        if (Array.isArray(profilesData)) {
            return profilesData;
        }

        if (
            profilesData &&
            Array.isArray(profilesData.profiles)
        ) {
            return profilesData.profiles;
        }

        return [];
    }

    // Find the relevant profile using recording ID first.
    // Use child ID only if no recording ID match exists.
    function getMatchingProfiles(lyricRecord, profiles) {
        const recordingId = String(
            lyricRecord.recording_id || ""
        ).trim();

        const childId = String(
            lyricRecord.child_id || ""
        ).trim();

        if (recordingId) {
            const matches = profiles.filter(profile =>
                String(profile.recording_id || "").trim() === recordingId
            );

            if (matches.length > 0) {
                return matches;
            }
        }

        if (childId) {
            return profiles.filter(profile =>
                String(profile.child_id || "").trim() === childId
            );
        }

        return [];
    }

    // Check whether an event refers to the target word.
    function eventContainsTarget(event, target) {
        const wanted = normalizeToken(target);

        if (!wanted) return false;

        const candidateValues = [
            event.target_word,
            event.observed_target_word,

            ...(Array.isArray(event.source_words)
                ? event.source_words
                : []),

            ...(Array.isArray(event.normalized_words)
                ? event.normalized_words
                : [])
        ];

        return candidateValues.some(value => {
            const candidate = normalizeToken(value);

            return (
                candidate !== "" &&
                candidate !== "unk" &&
                candidate === wanted
            );
        });
    }

    // Retrieve the single disfluency type for a target word.
    //
    // If the profile contains several events for the same word with
    // different types, the most frequent type is used. If two types are
    // equally frequent, the one that appears first in the profile wins.
    function findDisfluencyType(target, matchingProfiles) {
        const counts = new Map();

        matchingProfiles.forEach(profile => {
            const events = Array.isArray(profile.disfluency_events)
                ? profile.disfluency_events
                : [];

            events.forEach(event => {
                if (
                    eventContainsTarget(event, target) &&
                    event.type
                ) {
                    const type = String(event.type);

                    counts.set(type, (counts.get(type) || 0) + 1);
                }
            });
        });

        let bestType = null;
        let bestCount = 0;

        // Map keeps insertion order, so ties keep the earliest type.
        counts.forEach((count, type) => {
            if (count > bestCount) {
                bestType = type;
                bestCount = count;
            }
        });

        return bestType;
    }

    // Display "word_repetition" as "word repetition".
    function formatDisfluencyType(type) {
        return String(type).replace(/_/g, " ");
    }

    // Safely create HTML elements.
    function createCell(tagName, text) {
        const cell = document.createElement(tagName);
        cell.textContent = text;
        return cell;
    }

    // Display target words and their disfluency types.
    function renderTargetWordDisfluencies(
        lyricRecord,
        profilesData
    ) {
        const container = document.getElementById(
            "targetDisfluencies"
        );

        if (!container) {
            console.error(
                "Element #targetDisfluencies was not found in the HTML."
            );
            return;
        }

        container.replaceChildren();

        const condition = String(
            lyricRecord.condition || ""
        ).toUpperCase();

        // Target-word mapping is only applicable to P3, P4 and P5.
        if (!["P3", "P4", "P5"].includes(condition)) {
            const message = document.createElement("p");

            message.className = "question-help";
            message.textContent =
                "No target-word mapping for this condition.";

            container.appendChild(message);
            return;
        }

        const targets = Array.isArray(lyricRecord.target_words)
            ? lyricRecord.target_words
            : [];

        const lyrics = lyricRecord.final_lyric || "";

        // Only display target words actually used in the generated lyrics.
        const usedTargets = [
            ...new Set(
                targets.filter(target =>
                    targetOccursInLyrics(target, lyrics)
                )
            )
        ];

        if (usedTargets.length === 0) {
            const message = document.createElement("p");

            message.className = "question-help";
            message.textContent =
                "None of the specified target words were found in the generated lyrics.";

            container.appendChild(message);
            return;
        }

        const profiles = getProfilesArray(profilesData);

        const matchingProfiles = getMatchingProfiles(
            lyricRecord,
            profiles
        );

        if (matchingProfiles.length === 0) {
            const message = document.createElement("p");

            message.className = "question-help";
            message.textContent =
                "No matching synthetic profile was found for this recording or child.";

            container.appendChild(message);
        }

        // Build the results table.
        const table = document.createElement("table");

        table.className = "target-disfluency-table";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        headerRow.appendChild(
            createCell("th", "Target word")
        );

        headerRow.appendChild(
            createCell("th", "Disfluency type")
        );

        thead.appendChild(headerRow);

        const tbody = document.createElement("tbody");

        usedTargets.forEach(target => {
            const type = findDisfluencyType(
                target,
                matchingProfiles
            );

            const row = document.createElement("tr");

            row.appendChild(
                createCell("td", String(target))
            );

            row.appendChild(
                createCell(
                    "td",
                    type
                        ? formatDisfluencyType(type)
                        : "No matching event found in profile"
                )
            );

            tbody.appendChild(row);
        });

        table.appendChild(thead);
        table.appendChild(tbody);

        container.appendChild(table);
    }

    // Load the synthetic profiles JSON file.
    async function loadSyntheticProfiles(
        url = "./synthetic_profiles.json"
    ) {
        if (!cachedProfilesPromise) {
            cachedProfilesPromise = fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(
                            `Could not load ${url}: HTTP ${response.status}`
                        );
                    }

                    return response.json();
                })
                .catch(error => {
                    // Allow another attempt if loading fails.
                    cachedProfilesPromise = null;
                    throw error;
                });
        }

        return cachedProfilesPromise;
    }

    // Expose functions to evaluation.js.
    window.loadSyntheticProfiles = loadSyntheticProfiles;

    window.renderTargetWordDisfluencies =
        renderTargetWordDisfluencies;

})();