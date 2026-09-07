import sys
from pypdf import PdfReader


def configure_output():
    try:
        sys.stdout.reconfigure(
            encoding="utf-8",
            errors="replace"
        )
        sys.stderr.reconfigure(
            encoding="utf-8",
            errors="replace"
        )
    except Exception:
        pass


def main():
    configure_output()

    if len(sys.argv) < 2:
        print("Missing PDF file path.")
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        reader = PdfReader(pdf_path)

        if reader.is_encrypted:
            try:
                result = reader.decrypt("")

                if result == 0:
                    print(
                        "The PDF is encrypted or password-protected."
                    )
                    sys.exit(1)

            except Exception:
                print(
                    "The PDF is encrypted or password-protected."
                )
                sys.exit(1)

        if len(reader.pages) == 0:
            print(
                "The PDF does not contain readable pages."
            )
            sys.exit(1)

        extracted_pages = []

        # ResearchNAV metadata is normally located
        # in the title/front-matter/abstract pages.
        # Only process the first 5 pages instead of
        # printing the entire manuscript to Laravel.
        pages_to_read = min(
            len(reader.pages),
            5
        )

        for index in range(pages_to_read):
            page = reader.pages[index]

            try:
                text = page.extract_text(
                    extraction_mode="layout"
                ) or ""

            except Exception:
                try:
                    text = page.extract_text() or ""

                except Exception:
                    text = ""

            if text.strip():
                extracted_pages.append(
                    text.strip()
                )

        final_text = "\n\n".join(
            extracted_pages
        ).strip()

        if not final_text:
            print(
                "No extractable text found. "
                "Scanned or image-based PDFs are not supported."
            )
            sys.exit(1)

        print(final_text)

    except Exception as error:
        message = str(error).lower()

        if (
            "invalid pdf header" in message
            or "eof marker" in message
            or "stream has ended" in message
        ):
            print(
                "Invalid or corrupted PDF file."
            )
            sys.exit(1)

        print(
            f"PDF extraction failed: {error}"
        )
        sys.exit(1)


if __name__ == "__main__":
    main()