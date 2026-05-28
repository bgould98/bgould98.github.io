    const TEAM_NAME = "Celestial Thunder";
    const DEFAULT_ICS = "schedule.ics";
    const DEFAULT_RECAPS = "recaps.json";

    const output = document.querySelector("#schedule-output");
    const scheduleSubtitle = document.querySelector("#schedule-subtitle");
    const nextTitle = document.querySelector("#next-title");
    const nextDetails = document.querySelector("#next-details");
    const countdown = document.querySelector("#countdown");
    const refreshButton = document.querySelector("#refresh-schedule");
    const statTotal = document.querySelector("#stat-total");
    const statUpcoming = document.querySelector("#stat-upcoming");
    const statPast = document.querySelector("#stat-past");
    const recapCount = document.querySelector("#recap-count");
    const recapList = document.querySelector("#recap-list");

    refreshButton.addEventListener("click", () => {
      loadDefaultSchedule();
    });

    async function loadDefaultSchedule() {
      scheduleSubtitle.textContent = "Checking for " + DEFAULT_ICS + "...";
      try {
        const response = await fetch(DEFAULT_ICS, { cache: "no-store" });
        if (!response.ok) {
          showMissingSchedule();
          return;
        }
        const text = await response.text();
        const events = parseICS(text);
        const recaps = await loadRecaps();
        if (events.length) {
          renderSchedule(events, DEFAULT_ICS, recaps);
          scheduleSubtitle.textContent = "Loaded " + DEFAULT_ICS;
        } else {
          showMissingSchedule("No games were found in " + DEFAULT_ICS + ".");
        }
      } catch (error) {
        showMissingSchedule("Could not read " + DEFAULT_ICS + ". This works best after the site is published or served from a local web server.");
      }
    }

    function showMissingSchedule(message) {
      const note = message || "No schedule.ics file found yet.";
      output.innerHTML = emptyState("Schedule file not found", "Add the downloaded CSC calendar as projects/soccer/schedule.ics.");
      scheduleSubtitle.textContent = note;
      statTotal.textContent = "0";
      statUpcoming.textContent = "0";
      statPast.textContent = "0";
      renderRecapList([]);
      resetHero();
    }

    async function loadRecaps() {
      try {
        const response = await fetch(DEFAULT_RECAPS, { cache: "no-store" });
        if (!response.ok) return [];
        const recaps = await response.json();
        return Array.isArray(recaps) ? recaps.map(normalizeRecap).filter(Boolean) : [];
      } catch (error) {
        return [];
      }
    }

    function parseICS(text) {
      const unfolded = text.replace(/\r?\n[ \t]/g, "");
      const eventBlocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

      return eventBlocks
        .map((block) => {
          const props = getProperties(block);
          const date = parseDate(props.DTSTART);
          if (!date || !props.SUMMARY) return null;

          return {
            date,
            summary: cleanICSValue(props.SUMMARY),
            location: cleanICSValue(props.LOCATION || ""),
            description: cleanICSValue(props.DESCRIPTION || "")
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.date - b.date);
    }

    function getProperties(block) {
      return block.split(/\r?\n/).reduce((props, line) => {
        const separator = line.indexOf(":");
        if (separator === -1) return props;

        const rawKey = line.slice(0, separator).split(";")[0];
        const value = line.slice(separator + 1);
        props[rawKey] = value;
        return props;
      }, {});
    }

    function cleanICSValue(value) {
      return value
        .replace(/\\n/g, " ")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\s+/g, " ")
        .trim();
    }

    function parseDate(value) {
      if (!value) return null;
      const normalized = value.trim();
      const dateMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
      if (!dateMatch) return null;

      const [, year, month, day, hour = "00", minute = "00", second = "00", utc] = dateMatch;
      if (utc) {
        return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
      }

      return new Date(+year, +month - 1, +day, +hour, +minute, +second);
    }

    function renderSchedule(events, sourceName, recaps) {
      const now = new Date();
      const games = attachRecaps(events, recaps);
      const upcoming = games.filter((event) => event.date >= now);
      const past = games.filter((event) => event.date < now);

      statTotal.textContent = events.length;
      statUpcoming.textContent = upcoming.length;
      statPast.textContent = past.length;

      if (!events.length) {
        output.innerHTML = emptyState("No games found", "Make sure schedule.ics is a valid calendar file from CSC.");
        scheduleSubtitle.textContent = "No games were found in schedule.ics.";
        resetHero();
        renderRecapList([]);
        return;
      }

      scheduleSubtitle.textContent = "Loaded from " + sourceName + ". Times are shown in your device timezone.";

      if (upcoming.length) {
        renderNextGame(upcoming[0]);
      } else {
        nextTitle.textContent = "Season complete";
        nextDetails.innerHTML = "<span>All games in this calendar are in the past.</span>";
        countdown.textContent = "See game recaps";
      }

      let html = "";
      if (upcoming.length) {
        html += buildSection("Upcoming Games", upcoming);
      }
      if (!upcoming.length) {
        html += emptyState("No upcoming games", "Completed games are listed in the Game Recaps panel.");
      }

      output.innerHTML = '<div class="schedule-section">' + html + "</div>";
      renderRecapList(recaps);
    }

    function renderNextGame(event) {
      const opponent = getOpponent(event.summary);
      nextTitle.textContent = opponent ? TEAM_NAME + " vs " + opponent : event.summary;
      const safeLocation = escapeHTML(event.location);
      nextDetails.innerHTML = [
        "<span>" + formatDate(event.date) + "</span>",
        "<span>" + formatTime(event.date) + "</span>",
        event.location ? '<span><a href="' + mapsUrl(event.location) + '" target="_blank" rel="noopener">' + safeLocation + "</a></span>" : ""
      ].filter(Boolean).join("");
      countdown.textContent = countdownText(event.date);
    }

    function resetHero() {
      nextTitle.textContent = "Add schedule.ics";
      nextDetails.innerHTML = "<span>Save the CSC calendar file as projects/soccer/schedule.ics.</span>";
      countdown.textContent = "Ready for kickoff";
    }

    function buildSection(title, events) {
      return '<div class="section-label">' + title + '</div><div class="games-list">' + events.map(gameCard).join("") + "</div>";
    }

    function gameCard(event) {
      const opponent = getOpponent(event.summary);
      const safeTitle = escapeHTML(opponent ? "vs " + opponent : event.summary);
      const safeLocation = escapeHTML(event.location);
      const recap = event.recap ? recapHTML(event.recap) : "";
      const location = event.location
        ? '<a class="game-detail" href="' + mapsUrl(event.location) + '" target="_blank" rel="noopener">' + safeLocation + "</a>"
        : "";
      const result = event.recap ? '<div class="game-result"><span>' + resultLabel(event.recap) + '</span><strong>' + scoreLine(event.recap) + "</strong></div>" : "";

      return '<article class="game-card">' +
        '<div class="date-block"><span><span class="date-day">' + event.date.getDate() + '</span><span class="date-month">' + monthName(event.date) + '</span></span></div>' +
        '<div><div class="game-title">' + safeTitle + '</div>' +
        '<div class="game-meta"><span class="game-detail">' + formatDate(event.date) + '</span><span class="game-detail">' + formatTime(event.date) + '</span>' + location + recap + '</div></div>' +
        result +
        badgeHTML(event) +
        '</article>';
    }

    function renderRecapList(recaps) {
      const sortedRecaps = recaps.slice().sort((a, b) => b.date.localeCompare(a.date));
      recapCount.textContent = sortedRecaps.length;
      if (!sortedRecaps.length) {
        recapList.innerHTML = '<p class="recap-empty">No game recaps have been added yet.</p>';
        return;
      }

      recapList.innerHTML = sortedRecaps.map((recap) => {
        const opponent = escapeHTML(recapOpponent(recap));
        return '<a class="recap-item" href="' + escapeHTML(recap.url) + '" target="_blank" rel="noopener">' +
          '<span><strong>' + resultLabel(recap) + " " + scoreLine(recap) + '</strong><span>vs ' + opponent + '</span></span>' +
          '<span>' + formatDate(parseLocalDate(recap.date)) + '</span>' +
          '</a>';
      }).join("");
    }

    function attachRecaps(events, recaps) {
      return events.map((event) => ({
        ...event,
        recap: findRecapForEvent(event, recaps)
      }));
    }

    function findRecapForEvent(event, recaps) {
      const eventDate = toDateKey(event.date);
      const opponent = normalizeName(getOpponent(event.summary));
      const matches = recaps.filter((recap) => recap.date === eventDate);

      return matches.find((recap) => {
        const teams = [recap.homeTeam, recap.awayTeam].map(normalizeName);
        return teams.includes(normalizeName(TEAM_NAME)) && (!opponent || teams.includes(opponent));
      }) || matches[0] || null;
    }

    function normalizeRecap(recap) {
      if (!recap || !recap.date || !recap.homeTeam || !recap.awayTeam || !recap.url) return null;
      return {
        date: recap.date,
        homeTeam: String(recap.homeTeam),
        homeScore: Number(recap.homeScore),
        awayTeam: String(recap.awayTeam),
        awayScore: Number(recap.awayScore),
        field: recap.field ? String(recap.field) : "",
        url: String(recap.url)
      };
    }

    function recapHTML(recap) {
      const field = recap.field ? " - " + escapeHTML(recap.field) : "";
      return '<a class="game-detail recap-link" href="' + escapeHTML(recap.url) + '" target="_blank" rel="noopener">Recap' + field + '</a>';
    }

    function resultLabel(recap) {
      const teamScore = teamIsHome(recap) ? recap.homeScore : recap.awayScore;
      const opponentScore = teamIsHome(recap) ? recap.awayScore : recap.homeScore;
      if (teamScore > opponentScore) return "W";
      if (teamScore < opponentScore) return "L";
      return "T";
    }

    function scoreLine(recap) {
      return teamIsHome(recap)
        ? recap.homeScore + "-" + recap.awayScore
        : recap.awayScore + "-" + recap.homeScore;
    }

    function teamIsHome(recap) {
      return normalizeName(recap.homeTeam) === normalizeName(TEAM_NAME);
    }

    function recapOpponent(recap) {
      return teamIsHome(recap) ? recap.awayTeam : recap.homeTeam;
    }

    function emptyState(title, message) {
      return '<div class="empty"><strong>' + title + '</strong>' + message + '</div>';
    }

    function getOpponent(summary) {
      return summary
        .replace(new RegExp(TEAM_NAME, "gi"), "")
        .replace(/\bvs\.?\b/gi, "")
        .replace(/\bat\b/gi, "")
        .replace(/\bhome\b|\baway\b/gi, "")
        .replace(/\s+/g, " ")
        .replace(/^[-:|]+|[-:|]+$/g, "")
        .trim();
    }

    function inferHomeAway(event) {
      const summary = event.summary.toLowerCase();
      const teamPattern = escapeRegExp(TEAM_NAME.toLowerCase()).replace(/\s+/g, "\\s+");

      if (new RegExp("\\bat\\s+" + teamPattern + "\\b").test(summary)) return "home";
      if (new RegExp("\\b" + teamPattern + "\\s+at\\b").test(summary)) return "away";

      const combined = (event.summary + " " + event.description).toLowerCase();
      if (combined.includes("home")) return "home";
      if (combined.includes("away")) return "away";
      return "neutral";
    }

    function badgeHTML(event) {
      const status = inferHomeAway(event);
      const label = status.charAt(0).toUpperCase() + status.slice(1);
      return '<span class="badge badge-' + status + '">' + label + "</span>";
    }

    function formatDate(date) {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
    }

    function formatTime(date) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      });
    }

    function monthName(date) {
      return date.toLocaleString("en-US", { month: "short" });
    }

    function toDateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    function parseLocalDate(value) {
      const [year, month, day] = String(value).split("-").map(Number);
      return new Date(year, month - 1, day);
    }

    function countdownText(date) {
      const diff = date - new Date();
      if (diff <= 0) return "Starting soon";

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);

      if (days > 1) return "In " + days + " days";
      if (days === 1) return "Tomorrow";
      if (hours > 1) return "In " + hours + " hours";
      if (hours === 1) return "In 1 hour";
      if (minutes > 5) return "In " + minutes + " minutes";
      return "Starting soon";
    }

    function mapsUrl(location) {
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(location);
    }

    function escapeHTML(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function normalizeName(value) {
      return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }

    loadDefaultSchedule();
