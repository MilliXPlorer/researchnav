<?php

namespace App\Http\Controllers;

use App\Services\ManuscriptMetadataExtractor;
use App\Services\ResearchOfficeBulkImportService;
use Illuminate\Database\QueryException;
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
            'group_name' => ['nullable', 'string', 'max:500'],
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

        if ($request->filled('group_name') && $results !== []) {
            $usable = array_values(array_filter($results, fn (array $result): bool => $result['status'] !== 'failed'));
            usort($usable, fn (array $left, array $right): int => $this->metadataFileRank($left['file_name']) <=> $this->metadataFileRank($right['file_name']));
            $metadata = [
                'title' => null, 'researchers' => [], 'abstract' => null,
                'keywords' => [], 'year' => null, 'final_binding_date' => null,
                'institute' => null,
            ];
            foreach ($usable as $result) {
                foreach (array_keys($metadata) as $field) {
                    if ($this->metadataFileRank($result['file_name']) === 4 && in_array($field, ['title', 'researchers', 'year', 'final_binding_date', 'institute'], true)) {
                        continue;
                    }
                    if (($metadata[$field] === null || $metadata[$field] === [])
                        && ($result['metadata'][$field] ?? null) !== null
                        && ($result['metadata'][$field] ?? null) !== []) {
                        $metadata[$field] = $result['metadata'][$field];
                    }
                }
            }
            if ($metadata['title'] === null || trim((string) $metadata['title']) === '' || strlen((string) $metadata['title']) > 500) {
                $metadata['title'] = $this->titleFromGroupName($request->string('group_name')->toString());
            }
            $missing = [];
            foreach (['title', 'researchers', 'abstract', 'keywords', 'year', 'final_binding_date', 'institute'] as $field) {
                if ($metadata[$field] === null || $metadata[$field] === [] || $metadata[$field] === 'Unclassified') {
                    $missing[] = $field;
                }
            }
            $first = $results[0];
            $results = [[
                'file_name' => $request->string('group_name')->toString(),
                'file_size' => array_sum(array_column($results, 'file_size')),
                'mime_type' => 'application/x-researchnav-folder',
                'status' => $usable === [] ? 'failed' : ($missing === [] ? 'ready' : 'needs_review'),
                'missing_fields' => $missing,
                'metadata' => $metadata,
                ...($usable === [] ? ['error' => $first['error'] ?? 'No supported manuscript content could be extracted.'] : []),
            ]];
        }

        return response()->json([
            'message' => 'Manuscript metadata extraction completed.',

            'data' => $results,
        ]);
    }

    private function metadataFileRank(string $name): int
    {
        return match (true) {
            preg_match('/(?:front|cover|prelim|pre[\s_-]*pages?|title[\s_-]*page|table[\s_-]*of[\s_-]*contents?)/i', $name) === 1 => 0,
            preg_match('/(?:source[\s_-]*code|appendix|reference|minutes)/i', $name) === 1 => 4,
            preg_match('/(?:final[\s_-]*binding|bookbind|full[\s_-]*manuscript|manuscript|thesis)/i', $name) === 1 => 1,
            preg_match('/(?:content|body|chapter)/i', $name) === 1 => 2,
            default => 3,
        };
    }

    private function titleFromGroupName(string $groupName): ?string
    {
        $title = trim((string) preg_replace('/^\s*\d+\s*[-_.):]+\s*/', '', $groupName));

        return strlen($title) >= 10 && strlen($title) <= 500 ? $title : null;
    }

    public function import(Request $request, ManuscriptMetadataExtractor $extractor, ResearchOfficeBulkImportService $service): JsonResponse
    {
        try {
            $metadata = json_decode((string) $request->input('metadata'), true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $metadata = null;
        }

        if (is_array($metadata) && is_array($metadata['keywords'] ?? null)) {
            $uniqueKeywords = [];
            foreach ($metadata['keywords'] as $keyword) {
                if (! is_string($keyword)) {
                    $uniqueKeywords[] = $keyword;

                    continue;
                }

                $keyword = trim($keyword);
                $key = strtolower($keyword);
                if ($keyword !== '' && ! array_key_exists($key, $uniqueKeywords)) {
                    $uniqueKeywords[$key] = $keyword;
                }
            }
            $metadata['keywords'] = array_values($uniqueKeywords);
        }

        $uploadedFiles = $request->file('files', []);
        if (! is_array($uploadedFiles) || $uploadedFiles === []) {
            $uploadedFiles = [$request->file('file')];
        }
        $relativePaths = $request->input('relative_paths', []);
        $validator = Validator::make(['files' => $uploadedFiles, 'relative_paths' => $relativePaths, 'metadata' => $metadata], [
            'files' => ['required', 'array', 'min:1', 'max:20'],
            'files.*' => ['required', 'file', 'max:20480'],
            'relative_paths' => ['nullable', 'array'],
            'relative_paths.*' => ['string', 'max:1000'],
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
            'metadata.sdg_ids' => ['sometimes', 'array', 'max:17'],
            'metadata.sdg_ids.*' => ['integer', 'distinct', 'exists:sdgs,id'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Please review the manuscript file and metadata before uploading.',
                'errors' => $validator->errors(),
            ], 422);
        }

        if (collect($uploadedFiles)->contains(fn ($file) => ! in_array(strtolower($file->getClientOriginalExtension()), ['pdf', 'docx'], true))) {
            return response()->json(['message' => 'Only DOCX and text-based PDF manuscripts can be uploaded.'], 422);
        }

        try {
            // The ordered front file is metadata authority; reviewed metadata remains authoritative.
            $extractor->extract($uploadedFiles[0]->getRealPath(), strtolower($uploadedFiles[0]->getClientOriginalExtension()));
            $document = $service->import(
                $request->attributes->get('current_user'),
                count($uploadedFiles) === 1 ? $uploadedFiles[0] : $uploadedFiles,
                $validator->validated()['metadata'],
                $request,
                $relativePaths === [] ? null : $relativePaths,
            );

            return response()->json([
                'message' => 'The manuscript was uploaded successfully.',
                'data' => [
                    'id' => $document->id,
                    'title' => $document->title,
                    'submission_status' => $document->submission_status,
                    'archive_status' => $document->archive_status,
                    'visibility' => $document->visibility,
                ],
            ], 201);
        } catch (QueryException) {
            return response()->json(['message' => 'The manuscript could not be saved to the database.'], 500);
        } catch (\RuntimeException $exception) {
            $status = in_array($exception->getMessage(), [
                'This manuscript has already been uploaded.',
                'This manuscript has already been imported.',
                'A research record with this title already exists.',
            ], true) ? 409 : 422;

            return response()->json(['message' => $exception->getMessage()], $status);
        } catch (\Throwable) {
            return response()->json(['message' => 'The manuscript could not be uploaded. No final record was created.'], 500);
        }
    }
}
