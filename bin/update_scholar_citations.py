#!/usr/bin/env python

import os
import re
import sys
import unicodedata
import yaml
from datetime import datetime
from scholarly import scholarly, ProxyGenerator

BIB_FILE = "_bibliography/papers.bib"


def load_scholar_user_id() -> str:
    """Load the Google Scholar user ID from the configuration file."""
    config_file = "_data/socials.yml"
    if not os.path.exists(config_file):
        print(
            f"Configuration file {config_file} not found. Please ensure the file exists and contains your Google Scholar user ID."
        )
        sys.exit(1)
    try:
        with open(config_file, "r") as f:
            config = yaml.safe_load(f)
        scholar_user_id = config.get("scholar_userid")
        if not scholar_user_id:
            print(
                "No 'scholar_userid' found in the configuration file. Please add 'scholar_userid' to _data/socials.yml."
            )
            sys.exit(1)
        return scholar_user_id
    except yaml.YAMLError as e:
        print(
            f"Error parsing YAML file {config_file}: {e}. Please check the file for correct YAML syntax."
        )
        sys.exit(1)


def setup_proxy() -> None:
    """Route scholarly's requests through ScraperAPI to avoid Google Scholar IP blocking."""
    api_key = os.environ.get("SCRAPERAPI_API_KEY")
    if not api_key:
        print(
            "No SCRAPERAPI_API_KEY environment variable found. Please set it to your ScraperAPI key "
            "(sign up at https://www.scraperapi.com/) and add it as a GitHub Actions secret."
        )
        sys.exit(1)
    print("Configuring ScraperAPI proxy...")
    pg = ProxyGenerator()
    success = pg.ScraperAPI(api_key)
    print(f"ScraperAPI proxy configuration returned: {success}")
    if not success:
        print("Failed to configure ScraperAPI proxy. Please check your SCRAPERAPI_API_KEY.")
        sys.exit(1)
    scholarly.use_proxy(pg)
    print("Proxy attached to scholarly.")


def load_existing_scholar_ids(bib_file: str = BIB_FILE) -> set:
    """Return the set of google_scholar_id values already present in the bib file."""
    if not os.path.exists(bib_file):
        return set()
    with open(bib_file, "r") as f:
        content = f.read()
    return set(re.findall(r"google_scholar_id\s*=\s*\{([^}]+)\}", content))


def slugify_bib_key(author_str: str, year: str, title: str) -> str:
    """Generate a citation key like charlot2026contextaware from author/year/title."""
    first_author_last_word = (author_str.split(" and ")[0].strip().split()[-1:] or ["paper"])[0]
    ascii_last_name = (
        unicodedata.normalize("NFKD", first_author_last_word).encode("ascii", "ignore").decode()
    )
    first_title_word = re.sub(r"[^a-zA-Z]", "", title.split()[0]) if title.split() else "paper"
    key = f"{ascii_last_name.lower()}{year}{first_title_word.lower()}"
    return re.sub(r"[^a-z0-9]", "", key) or f"paper{year}"


def build_bib_entry(pub: dict, suffix_id: str) -> str:
    """Deep-fill a scholarly publication and render it as a BibTeX entry string."""
    filled = scholarly.fill(pub)
    bib = filled.get("bib", {})

    title = bib.get("title", "Unknown Title")
    author = bib.get("author", "Unknown")
    year = bib.get("pub_year", "")
    venue = bib.get("journal") or bib.get("venue") or bib.get("citation") or "Unknown venue"
    key = slugify_bib_key(author, year or "", title)

    lines = [
        f"@article{{{key},",
        "  bibtex_show       = {true},",
        f"  title             = {{{title}}},",
        f"  author            = {{{author}}},",
        f"  journal           = {{{venue}}},",
        f"  year              = {{{year}}},",
        f"  google_scholar_id = {{{suffix_id}}}",
        "}",
    ]
    return "\n".join(lines)


def append_new_bib_entries(new_pubs: list, bib_file: str = BIB_FILE) -> None:
    """Fetch full details for publications not yet in the bib file and append them."""
    entries = []
    for pub, suffix_id in new_pubs:
        title = pub.get("bib", {}).get("title", "Unknown Title")
        try:
            print(f"New publication found (not in {bib_file}): {title}. Fetching full details...")
            entries.append(build_bib_entry(pub, suffix_id))
        except Exception as e:
            print(f"Warning: Could not fetch full details for '{title}': {e}. Skipping auto-add.")

    if not entries:
        return

    with open(bib_file, "a") as f:
        for entry in entries:
            f.write("\n" + entry + "\n")

    print(f"Appended {len(entries)} new entr{'y' if len(entries) == 1 else 'ies'} to {bib_file}.")


SCHOLAR_USER_ID: str = load_scholar_user_id()
OUTPUT_FILE: str = "_data/citations.yml"


def get_scholar_citations() -> None:
    """Fetch and update Google Scholar citation data."""
    print(f"Fetching citations for Google Scholar ID: {SCHOLAR_USER_ID}")
    today = datetime.now().strftime("%Y-%m-%d")

    existing_data = None
    # Check if the output file was already updated today
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r") as f:
                existing_data = yaml.safe_load(f)
            if (
                existing_data
                and "metadata" in existing_data
                and "last_updated" in existing_data["metadata"]
            ):
                print(f"Last updated on: {existing_data['metadata']['last_updated']}")
                if existing_data["metadata"]["last_updated"] == today:
                    print("Citations data is already up-to-date. Skipping fetch.")
                    return
        except Exception as e:
            print(
                f"Warning: Could not read existing citation data from {OUTPUT_FILE}: {e}. The file may be missing or corrupted."
            )

    citation_data = {"metadata": {"last_updated": today}, "papers": {}}

    scholarly.set_timeout(30)
    scholarly.set_retries(1)
    try:
        print("Calling scholarly.search_author_id...")
        author = scholarly.search_author_id(SCHOLAR_USER_ID)
        print(f"search_author_id returned: {author.get('name', 'unknown') if author else author}")
        print("Calling scholarly.fill...")
        author_data = scholarly.fill(author)
        print("scholarly.fill completed.")
    except Exception as e:
        print(
            f"Error fetching author data from Google Scholar for user ID '{SCHOLAR_USER_ID}': {e}. Please check your internet connection and Scholar user ID."
        )
        sys.exit(1)

    if not author_data:
        print(
            f"Could not fetch author data for user ID '{SCHOLAR_USER_ID}'. Please verify the Scholar user ID and try again."
        )
        sys.exit(1)

    if "publications" not in author_data:
        print(f"No publications found in author data for user ID '{SCHOLAR_USER_ID}'.")
        sys.exit(1)

    existing_bib_ids = load_existing_scholar_ids()
    new_pubs = []

    for pub in author_data["publications"]:
        try:
            pub_id = pub.get("pub_id") or pub.get("author_pub_id")
            if not pub_id:
                print(
                    f"Warning: No ID found for publication: {pub.get('bib', {}).get('title', 'Unknown')}. This publication will be skipped."
                )
                continue

            title = pub.get("bib", {}).get("title", "Unknown Title")
            year = pub.get("bib", {}).get("pub_year", "Unknown Year")
            citations = pub.get("num_citations", 0)

            print(f"Found: {title} ({year}) - Citations: {citations}")

            citation_data["papers"][pub_id] = {
                "title": title,
                "year": year,
                "citations": citations,
            }

            suffix_id = pub_id.split(":")[-1]
            if suffix_id not in existing_bib_ids:
                new_pubs.append((pub, suffix_id))
        except Exception as e:
            print(
                f"Error processing publication '{pub.get('bib', {}).get('title', 'Unknown')}': {e}. This publication will be skipped."
            )

    if new_pubs:
        append_new_bib_entries(new_pubs)

    # Compare new data with existing data
    if existing_data and existing_data.get("papers") == citation_data["papers"]:
        print("No changes in citation data. Skipping file update.")
        return

    try:
        with open(OUTPUT_FILE, "w") as f:
            yaml.dump(citation_data, f, width=1000, sort_keys=True)
        print(f"Citation data saved to {OUTPUT_FILE}")
    except Exception as e:
        print(
            f"Error writing citation data to {OUTPUT_FILE}: {e}. Please check file permissions and disk space."
        )
        sys.exit(1)


if __name__ == "__main__":
    try:
        setup_proxy()
        get_scholar_citations()
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)
