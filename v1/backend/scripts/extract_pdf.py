import sys
import pymupdf


def configure_output():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def main():
    configure_output()

    if len(sys.argv) < 2:
        print("Missing PDF file path.")
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        with pymupdf.open(pdf_path) as document:
            if document.needs_pass and document.authenticate("") == 0:
                print("The PDF is encrypted or password-protected.")
                sys.exit(1)

            if document.page_count == 0:
                print("The PDF does not contain readable pages.")
                sys.exit(1)

            extracted_pages = []

            # ResearchNAV metadata is normally located in the title,
            # front-matter, and abstract pages.
            pages_to_read = min(document.page_count, 10)

            for index in range(pages_to_read):
                page = document.load_page(index)

                try:
                    text = page.get_text("text", sort=True) or ""
                except Exception:
                    text = ""

                # Keep empty pages so form-feed separators represent physical
                # PDF pages and title extraction remains limited to pages 1-2.
                extracted_pages.append(text.strip())

            # Preserve page boundaries so title extraction can stay on pages
            # 1-2 while abstract and keyword extraction inspect pages 1-10.
            final_text = "\n\f\n".join(extracted_pages).strip()

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
            print("Invalid or corrupted PDF file.")
            sys.exit(1)

        print(f"PDF extraction failed: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
