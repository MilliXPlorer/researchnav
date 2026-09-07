<?php

namespace App\Http\Controllers;

use App\Services\ManuscriptMetadataExtractor;
use App\Services\ResearchOfficeBulkImportService;
use App\Services\SupabaseStorageException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use JsonException;

class ResearchOfficeBulkImportController extends Controller
{
    private const INSTITUTES = [
        'Institute of Computer Studies',
        'Institute of Health Sciences',
        'Institute of Business and Financial Management',
        'Institute of Arts and Sciences',
        'Institute of Criminal Justice Education',
        'Institute of Teacher Education',
        'Unclassified',
    ];

    public function preview(
        Request $request,
        ManuscriptMetadataExtractor $extractor
    ): JsonResponse {
        $validator = Validator::make($request->all(), [
            'files' => [
                'required',
                'array',
                'min:1',
                'max:20',
            ],

            'files.*' => [
                'required',
                'file',
                'max:20480',
            ],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Please upload valid DOCX or text-based PDF manuscript files.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $results = [];

        foreach ($request->file('files', []) as $file) {
            try {
                $extension = strtolower(
                    $file->getClientOriginalExtension()
                );

                /*
                 * Only DOCX and PDF manuscript files are supported.
                 *
                 * We validate the extension manually instead of relying only
                 * on Laravel's mimes rule because DOCX files can sometimes
                 * be detected by PHP as ZIP archives.
                 */
                if (! in_array($extension, ['docx', 'pdf'], true)) {
                    $results[] = [
                        'file_name' => $file->getClientOriginalName(),
                        'file_size' => $file->getSize(),
                        'mime_type' => $file->getMimeType(),

                        'status' => 'failed',

                        'missing_fields' => [],

                        'metadata' => [
                            'title' => null,
                            'researchers' => [],
                            'abstract' => null,
                            'keywords' => [],
                            'year' => null,
                            'final_binding_date' => null,
                            'institute' => 'Unclassified',
                        ],

                        'error' => 'Unsupported file type. Please upload a DOCX or text-based PDF manuscript.',
                    ];

                    continue;
                }

                /*
                 * Let ManuscriptMetadataExtractor decide which extraction
                 * method to use based on the actual file extension.
                 */
                $metadata = $extractor->extract(
                    $file->getRealPath(),
                    $extension
                );

                $missing = [];

                if (empty($metadata['title'])) {
                    $missing[] = 'title';
                }

                if (empty($metadata['researchers'])) {
                    $missing[] = 'researchers';
                }

                if (empty($metadata['abstract'])) {
                    $missing[] = 'abstract';
                }

                if (empty($metadata['keywords'])) {
                    $missing[] = 'keywords';
                }

                if (empty($metadata['year'])) {
                    $missing[] = 'year';
                }

                if (empty($metadata['final_binding_date'])) {
                    $missing[] = 'final_binding_date';
                }

                if (($metadata['institute'] ?? 'Unclassified') === 'Unclassified') {
                    $missing[] = 'institute';
                }

                $results[] = [
                    'file_name' => $file->getClientOriginalName(),
                    'file_size' => $file->getSize(),
                    'mime_type' => $file->getMimeType(),

                    'status' => empty($missing)
                        ? 'ready'
                        : 'needs_review',

                    'missing_fields' => $missing,

                    'metadata' => [
                        'title' => $metadata['title'] ?? null,

                        'researchers' => $metadata['researchers'] ?? [],

                        'abstract' => $metadata['abstract'] ?? null,

                        'keywords' => $metadata['keywords'] ?? [],

                        'year' => $metadata['year'] ?? null,

                        'final_binding_date' => $metadata['final_binding_date'] ?? null,

                        'institute' => $metadata['institute'] ?? 'Unclassified',
                    ],
                ];
            } catch (\Throwable $exception) {
                $results[] = [
                    'file_name' => $file->getClientOriginalName(),
                    'file_size' => $file->getSize(),
                    'mime_type' => $file->getMimeType(),

                    'status' => 'failed',

                    'missing_fields' => [],

                    'metadata' => [
                        'title' => null,
                        'researchers' => [],
                        'abstract' => null,
                        'keywords' => [],
                        'year' => null,
                        'final_binding_date' => null,
                        'institute' => 'Unclassified',
                    ],

                    'error' => 'This manuscript could not be read. Please upload a valid DOCX or text-based PDF file.',
                ];
            }
        }

        return response()->json([
            'message' => 'Manuscript metadata extraction completed.',

            'data' => $results,
        ]);
    }

    public function import(Request $request, ManuscriptMetadataExtractor $extractor, ResearchOfficeBulkImportService $service): JsonResponse
    {
        try {
            $metadata = json_decode((string) $request->input('metadata'), true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $metadata = null;
        }

        $validator = Validator::make(['file' => $request->file('file'), 'metadata' => $metadata], [
            'file' => ['required', 'file', 'max:20480'],
            'metadata' => ['required', 'array'],
            'metadata.title' => ['required', 'string', 'max:500'],
            'metadata.researchers' => ['required', 'array', 'min:1', 'max:50'],
            'metadata.researchers.*' => ['required', 'string', 'max:255', 'distinct'],
            'metadata.abstract' => ['required', 'string', 'max:50000'],
            'metadata.keywords' => ['required', 'array', 'min:1', 'max:50'],
            'metadata.keywords.*' => ['required', 'string', 'max:255', 'distinct'],
            'metadata.year' => ['required', 'integer', 'between:1901,2155'],
            'metadata.final_binding_date' => ['required', 'string', 'max:50'],
            'metadata.institute' => ['required', 'string', 'in:'.implode(',', self::INSTITUTES)],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Please review the manuscript file and metadata before importing.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $file = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension());
        if (! in_array($extension, ['pdf', 'docx'], true)) {
            return response()->json(['message' => 'Only DOCX and text-based PDF manuscripts can be imported.'], 422);
        }

        try {
            // Re-extraction validates the actual manuscript structure; reviewed metadata remains authoritative.
            $extracted = $extractor->extract($file->getRealPath(), $extension);
            $document = $service->import(
                $request->attributes->get('current_user'),
                $file,
                $validator->validated()['metadata'],
                $request,
                $extracted['raw_text'] ?? null,
            );

            return response()->json([
                'message' => 'The manuscript was imported successfully.',
                'data' => [
                    'id' => $document->id,
                    'title' => $document->title,
                    'submission_status' => $document->submission_status,
                    'archive_status' => $document->archive_status,
                    'visibility' => $document->visibility,
                ],
            ], 201);
        } catch (SupabaseStorageException) {
            return response()->json(['message' => 'Manuscript storage is temporarily unavailable. Please try again.'], 503);
        } catch (\RuntimeException $exception) {
            $status = in_array($exception->getMessage(), [
                'This manuscript has already been imported.',
                'A research record with this title already exists.',
            ], true) ? 409 : 422;

            return response()->json(['message' => $status === 409 ? $exception->getMessage() : 'The manuscript could not be validated for import.'], $status);
        } catch (\Throwable) {
            return response()->json(['message' => 'The manuscript could not be imported. No final record was created.'], 500);
        }
    }
}
