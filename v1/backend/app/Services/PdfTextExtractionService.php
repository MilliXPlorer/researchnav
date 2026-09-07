<?php

namespace App\Services;

class PdfTextExtractionService
{
    public function extract(string $filePath): string
    {
        $scriptPath = base_path('scripts/extract_pdf.py');

        if (! is_file($scriptPath)) {
            throw new \RuntimeException(
                'PDF extraction service is not available.'
            );
        }

        if (! is_file($filePath)) {
            throw new \RuntimeException(
                'Uploaded PDF file was not found.'
            );
        }

        if (! is_readable($filePath)) {
            throw new \RuntimeException(
                'Uploaded PDF file cannot be read.'
            );
        }

        $pythonCommand = $this->getPythonCommand();

        $command = sprintf(
            '%s %s %s 2>&1',
            $pythonCommand,
            escapeshellarg($scriptPath),
            escapeshellarg($filePath)
        );

        $output = [];
        $exitCode = 0;

        exec(
            $command,
            $output,
            $exitCode
        );

        $text = trim(
            implode("\n", $output)
        );

        if ($exitCode !== 0) {
            $this->handleExtractionError($text);
        }

        if ($text === '') {
            throw new \RuntimeException(
                'No extractable text found. Scanned or image-based PDFs are not supported.'
            );
        }

        return $text;
    }

    private function handleExtractionError(string $error): void
    {
        $lower = strtolower($error);

        /*
         * Corrupted or malformed PDF.
         */
        if (
            str_contains($lower, 'invalid pdf header') ||
            str_contains($lower, 'eof marker not found') ||
            str_contains($lower, 'stream has ended unexpectedly') ||
            str_contains($lower, 'invalid pdf') ||
            str_contains($lower, 'malformed') ||
            str_contains($lower, 'broken xref') ||
            str_contains($lower, 'xref table not found')
        ) {
            throw new \RuntimeException(
                'Invalid or corrupted PDF file. Please upload a valid text-based PDF or DOCX copy.'
            );
        }

        /*
         * Scanned or image-only PDF.
         */
        if (
            str_contains($lower, 'no extractable text') ||
            str_contains($lower, 'no text found') ||
            str_contains($lower, 'scanned') ||
            str_contains($lower, 'image-based')
        ) {
            throw new \RuntimeException(
                'No extractable text found. Scanned or image-based PDFs are not supported.'
            );
        }

        /*
         * Password-protected/encrypted PDF.
         */
        if (
            str_contains($lower, 'encrypted') ||
            str_contains($lower, 'password') ||
            str_contains($lower, 'decrypt')
        ) {
            throw new \RuntimeException(
                'This PDF is encrypted or password-protected. Please upload an unlocked copy.'
            );
        }

        /*
         * Generic PDF error.
         */
        throw new \RuntimeException(
            'Unable to process this PDF file. Please upload a valid text-based PDF or DOCX copy.'
        );
    }

    private function getPythonCommand(): string
    {
        /*
         * Try the normal Windows/Python command first.
         */
        $output = [];
        $exitCode = 0;

        exec(
            'python --version 2>&1',
            $output,
            $exitCode
        );

        if ($exitCode === 0) {
            return 'python';
        }

        /*
         * Some Windows installations use "py".
         */
        $output = [];
        $exitCode = 0;

        exec(
            'py --version 2>&1',
            $output,
            $exitCode
        );

        if ($exitCode === 0) {
            return 'py';
        }

        throw new \RuntimeException(
            'PDF extraction service is unavailable because Python was not found.'
        );
    }
}
