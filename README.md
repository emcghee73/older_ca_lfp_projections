# ADP Applicant Download and Anonymization

This project provides a local workflow for:

1. Opening an authenticated browser session against ADP and automatically downloading resumes from the applications grid.
2. Converting downloaded application files into anonymized text copies named with numeric applicant codes.
3. Writing a separate decoder CSV that maps each numeric code back to the applicant's identifying details.

## Projection trend explorer

This repo also includes a browser-based explorer for the projections dataset at [index.html](/Users/ericmcghee/Documents/New project/index.html).

Run it locally with:

```bash
npm run start
```

Then open [http://localhost:8000](http://localhost:8000).

The explorer:

- Loads `data/projections_age5cat_2006_2040.csv`
- Lets you choose one outcome from the supported projection columns, including `Poor if not working` when `poor_if_no_wage` is present in the CSV
- Lets you subset by any combination of `latino` through `ed_collgrad`
- Collapses matched rows to yearly weighted means using `totpop`
- Lets you download the resulting yearly series as CSV

## Bilogit state fits

This repo also includes an R script for fitting state-by-state bilogit curves to Democratic two-party presidential vote shares by congressional district, with an optional statewide vote-share target:

```bash
Rscript scripts/bilogit_state_fit.R district_vote_shares.csv output/bilogit state_vote_shares.csv
```

Expected inputs:

- `district_vote_shares.csv` with at least `state`, `district`, and `dem_share`
- `state_vote_shares.csv` with at least `state` and `dem_share`

The fitted model is:

```text
logit(vote_share) = alpha + beta * logit(percentile)
```

For each state, the script sorts district vote shares, searches for the best percentile shift over `[0,1]`, and writes:

- `output/bilogit_state_fits.csv`
- `output/bilogit_district_fits.csv`

There is also a helper for recovering a smooth empirical latent-error distribution that approximately reproduces a target bilogit when 100 bounded unit values are shifted up and down together:

```bash
Rscript scripts/bilogit_error_calibration.R 0.2 1.4 output/bilogit_errors 100 0.5 0.55
```

Arguments:

- `alpha`
- `beta`
- `output_prefix`
- optional `n_units` (default `100`)
- optional threshold (default `0.5`)
- optional example target mean for writing one unit-level dataset

Outputs:

- `output/bilogit_errors_errors.csv` with the recovered latent errors
- `output/bilogit_errors_curve.csv` with the fitted step-curve against the target bilogit
- `output/bilogit_errors_units.csv` when an example target mean is supplied

This calibration is approximate rather than exact: once the unit values are bounded to `[0, 1]` and the horizontal axis is the observed mean of those bounded values, a bilogit curve does not uniquely identify a single latent error distribution.

## ADP selectors used

The downloader was wired against saved HTML from your ADP pages. It currently targets:

- The applications grid on the recruitment page
- The `Last Updated` column with `col-id="DATE_UPDATED"`
- The clickable candidate-name buttons in the `CANIDATE_NAME` column
- The candidate profile `Download resume` button
- The candidate profile tab with title `Additional Documents(n)`

If ADP changes those controls, the downloader will need a selector refresh.

## Setup

```bash
npm install
```

## Step 1: Open the ADP download session

```bash
OKTA_URL="https://ppic.okta.com/app/UserHome?session_hint=AUTHENTICATED" \
ADP_URL="https://workforcenow.adp.com/theme/index.html#/MyTeam/MyTeamTabTalentCategoryRecruitment" \
UPDATED_SINCE="2025-11-01" \
npm run download
```

What this does:

- Opens a Chromium browser with downloads saved to `data/downloads/raw`.
- Reuses login state from `data/auth/adp-storage-state.json` after the first successful login.
- Starts at Okta on every run.
- You complete Okta, open ADP if needed, and get to the Recruitment page before pressing Enter.
- The saved session is still updated after each run, but the script no longer skips straight to ADP first.
- Sorts the applications grid by `Last Updated`.
- Walks application rows until it reaches a row older than November 1, 2025.
- Opens each candidate profile and clicks `Download resume`.
- Opens the `Additional Documents` tab when the count is greater than zero and attempts each visible non-resume download button there.
- Saves each downloaded file into the raw download folder with the candidate name prefixed.

Optional limit:

```bash
MAX_APPLICATIONS=100 npm run download
```

Visible-page-only mode:

```bash
npm run download:visible-page
```

This mode processes only the currently visible ADP page of candidates, then stops. You can manually click `Next Page` in ADP and rerun it.

On-screen mode details:

- It uses the list exactly as currently displayed in ADP.
- It does not auto-sort by `Last Updated`.
- It does not auto-click `Next Page`.
- It prints the captured visible candidate names before it starts, so you can verify it matches what you see.
- After finishing the current screen, it asks whether you want to process another screen.
- If you answer `y`, leave the ADP window open, move to the next page or screen in ADP, and press Enter.
- If you answer `n`, the script exits and then closes the browser.

## Current scope

The downloader automates the profile-page resume download and makes a best-effort pass over the profile-page `Additional Documents` tab. Because your saved sample candidate had `Additional Documents(0)`, that part was implemented from the tab structure rather than a real downloaded example, so it may need one selector adjustment once you test it against a candidate who actually has files there.

## Step 2: Anonymize the downloaded files

```bash
python3 ./scripts/anonymize_applications.py \
  --input ./data/downloads/raw \
  --output ./data/output
```

Output:

- Anonymized text files under `data/output/anonymized/<numeric-code>/`
- A decoder file at `data/output/decoder.csv`
- A processing summary at `data/output/summary.json`

## Grouping behavior

The anonymizer tries to group multiple files from the same applicant by matching:

1. Email address
2. Phone number
3. Inferred applicant name
4. Filename stem as a fallback

If several files belong to one applicant, they receive the same numeric code.

## Supported inputs

The anonymizer reads text from:

- Plain text formats such as `.txt`, `.md`, `.csv`
- `.doc`, `.docx`, `.rtf`, `.html` via macOS `textutil`
- `.pdf` via Spotlight text extraction (`mdls`) or `pdftotext` if installed

Anonymized outputs are written as `.txt` so the masking is explicit and reviewable.

## Step 3: Rank applicants with the OpenAI API

Set your API key in Terminal:

```bash
export OPENAI_API_KEY="YOUR_API_KEY_HERE"
```

Then run:

```bash
python3 ./scripts/rank_applicants.py \
  --input ./data/output/anonymized \
  --decoder ./data/output/decoder.csv \
  --output-dir ./data/output/ranking \
  --top-n 40
```

Or use:

```bash
npm run rank
```

This step:

- Reads all anonymized files and groups them by applicant code using `decoder.csv`
- Applies the internship rubric through the OpenAI API
- Scores Python experience heavily
- Scores public-policy interest and data-analysis fit
- Penalizes candidates who appear purely business- or CS-oriented without signs of public-policy interest
- Writes a full ranking to `data/output/ranking/rankings.csv`
- Writes the top 40 to `data/output/ranking/top_40.csv`
- Writes a readable summary to `data/output/ranking/top_40.md`

Default model:

- `gpt-4o-mini`

Optional overrides:

```bash
OPENAI_MODEL=gpt-4.1-mini npm run rank
```

```bash
python3 ./scripts/rank_applicants.py --top-n 50
```

## Google Analytics page view export

This repo now also includes a GA4 page-view export script at [scripts/google_analytics_pageviews.py](/Users/ericmcghee/Documents/New project/scripts/google_analytics_pageviews.py).

Important:

- This uses the supported Google Analytics Data API for GA4.
- It does not automate a Google username/password login.
- The script now uses browser-based OAuth for a normal Google user account that has access to the GA4 properties.

### What it returns

- Total `screenPageViews` for each publication/property in your CSV
- A grand total across all successful properties
- A CSV export with one row per publication

### 1. Create OAuth credentials for a desktop app

Use Google’s current GA/Data API setup:

- Create or choose a Google Cloud project
- Enable the Google Analytics Data API in that project
- Create an OAuth client ID for a Desktop app
- Use a Google user account that already has Viewer or Analyst access to each GA4 property

Google’s official docs:

- [Google Analytics Data API overview](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Google Analytics Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries)
- [Create a report with `runReport`](https://developers.google.com/analytics/devguides/reporting/data/v1/basics)
- [`screenPageViews` metric reference](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [Google OAuth 2.0 for installed applications](https://developers.google.com/identity/protocols/oauth2)

### 2. Create your publications CSV

Start from [scripts/google_analytics_publications.example.csv](/Users/ericmcghee/Documents/New project/scripts/google_analytics_publications.example.csv):

```csv
publication,property_id
Main Site,123456789
Magazine,234567890
Research Blog,345678901
```

Each GA4 property ID should be digits only.

### 3. Run the script

```bash
python3 ./scripts/google_analytics_pageviews.py \
  --publications ./scripts/google_analytics_publications.example.csv \
  --start-date 2026-01-01 \
  --end-date 2026-03-31 \
  --client-id YOUR_DESKTOP_APP_CLIENT_ID \
  --output ./tmp-output/google-analytics-pageviews.csv
```

If your desktop app credential also gives you a client secret, you can pass it too:

```bash
python3 ./scripts/google_analytics_pageviews.py \
  --publications ./scripts/google_analytics_publications.example.csv \
  --start-date 2026-01-01 \
  --end-date 2026-03-31 \
  --client-id YOUR_DESKTOP_APP_CLIENT_ID \
  --client-secret YOUR_DESKTOP_APP_CLIENT_SECRET
```

On the first run:

- The script opens Google sign-in in your browser
- You log in with your normal Google account
- Google redirects back to a temporary localhost callback
- The script stores the returned refresh token locally

By default, the local token cache is written to:

- `data/auth/google-analytics-oauth-token.json`

### Output

The script prints:

- Per-publication page-view totals
- A grand total across successful properties

It also writes a CSV with:

- `publication`
- `property_id`
- `start_date`
- `end_date`
- `page_views`
- `status`
- `error`

### Notes

- This script is written for GA4 properties, not legacy Universal Analytics.
- The metric used is `screenPageViews`, which Google documents as the GA4 "Views" metric.
- If one property fails, the script still writes results for the rest and exits with a non-zero status so failures are visible.
- You do not give the script your Google password directly. Authentication happens on Google’s sign-in page in the browser.
