<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Http\Requests\OfficeUserIndexRequest;
use App\Models\ComplianceReview;
use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\ComplianceService;
use App\Services\PrivateDocumentFileResolver;
use App\Services\ReportingService;
use App\Services\ResearchProjectTeamService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;
use ZipArchive;

class ResearchOfficeController extends DomainController
{
    public function compliance(ComplianceService $compliance): JsonResponse
    {
        return response()
            ->json(['data' => $compliance->pendingQueue(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function decideCompliance(Request $request, ResearchDocument $researchDocument, ComplianceService $compliance): JsonResponse
    {
        $input = $this->validated($request, [
            'format_compliant' => ['nullable', 'boolean'],
            'attachments_compliant' => ['nullable', 'boolean'],
            'consent_forms_compliant' => ['nullable', 'boolean'],
            'remarks' => ['nullable', 'string', 'max:5000'],
            'review_status' => ['required', 'string'],
        ]);
        ComplianceService::guardStatus($input['review_status']);
        if ($input['review_status'] === 'pending') {
            return response()->json(['error' => 'INVALID_REVIEW_STATUS'], 422);
        }
        $review = $compliance->decide($this->actor($request), $researchDocument, $input, $request);

        return response()->json(['data' => $this->payload($review)]);
    }

    public function users(OfficeUserIndexRequest $request): JsonResponse
    {
        $input = $request->validated();
        $query = User::query()
            ->select(['id', 'email', 'first_name', 'middle_name', 'last_name', 'role', 'access_status', 'created_at', 'updated_at']);

        if (isset($input['role']) && $input['role'] !== '') {
            $query->where('role', $input['role']);
        }
        if (isset($input['access_status']) && $input['access_status'] !== '') {
            $query->where('access_status', $input['access_status']);
        }
        if (isset($input['search']) && $input['search'] !== '') {
            $like = '%'.$this->escapedLike($input['search']).'%';
            $query->where(function (Builder $query) use ($like): void {
                foreach (['email', 'first_name', 'middle_name', 'last_name'] as $column) {
                    $query->orWhereRaw("{$column} LIKE ? ESCAPE '!'", [$like]);
                }
            });
        }

        $sort = $input['sort'] ?? null;
        $direction = $input['direction'] ?? 'asc';
        if ($sort !== null) {
            $query->orderBy($sort, $direction);
        } else {
            $query->orderByDesc('created_at');
        }
        $query->orderBy('id', $sort === null ? 'desc' : $direction);

        return response()
            ->json([
                'data' => $query->paginate($input['per_page'] ?? 25)->appends($request->query()),
                'schema_version' => 1,
            ])
            ->header('Cache-Control', 'private, no-store');
    }

    public function updateUser(Request $request, string $user): JsonResponse
    {
        $input = $this->validated($request, [
            'access_status' => ['required', 'string', 'max:20'],
        ]);
        $target = User::query()->find($user);
        if ($target === null) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! in_array($input['access_status'], User::ACCESS_STATUSES, true)) {
            return response()->json(['error' => 'INVALID_ACCESS_STATUS'], 422);
        }
        $actor = $this->actor($request);
        if ($actor->is($target) || $target->role === 'admin') {
            return response()->json(['error' => 'ACCOUNT_MUTATION_NOT_ALLOWED'], 409);
        }
        $target->update(['access_status' => $input['access_status']]);

        return response()
            ->json(['data' => [
                'id' => $target->id,
                'email' => $target->email,
                'role' => $target->role,
                'access_status' => $target->access_status,
            ]])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reports(ReportingService $reports): JsonResponse
    {
        return response()
            ->json(['data' => $reports->officeInstitutional()])
            ->header('Cache-Control', 'private, no-store');
    }

    public function projectTeam(ResearchDocument $researchDocument, ResearchProjectTeamService $teams): JsonResponse
    {
        $section = $researchDocument->section()->firstOrFail();

        return response()->json(['data' => $teams->get($section, $researchDocument)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function representativeCandidates(ResearchDocument $researchDocument, ResearchProjectTeamService $teams): JsonResponse
    {
        $section = $researchDocument->section()->firstOrFail();

        return response()->json(['data' => $teams->candidates($section, $researchDocument, 'research_office_representative', null)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function assignRepresentative(Request $request, ResearchDocument $researchDocument, ResearchProjectTeamService $teams): JsonResponse
    {
        $input = $this->validated($request, [
            'user_id' => ['nullable', 'string', 'exists:users,id'],
        ]);
        $section = $researchDocument->section()->firstOrFail();
        $team = $teams->replaceRole(
            $this->actor($request),
            $section,
            $researchDocument,
            'research_office_representative',
            $input['user_id'] ?? null,
            $request,
        );

        return response()->json(['data' => $team])
            ->header('Cache-Control', 'private, no-store');
    }

    private const INSTITUTE_CODES = [
        'IHS' => 'Institute of Health Sciences',
        'ICS' => 'Institute of Computer Studies',
        'IBFS' => 'Institute of Business and Financial Management',
        'ICJE' => 'Institute of Criminal Justice Education',
        'ITE' => 'Institute of Teacher Education',
        'IAS' => 'Institute of Arts and Sciences',
    ];

    public function instituteStudies(string $institute): JsonResponse
    {
        $fullName = self::INSTITUTE_CODES[strtoupper($institute)] ?? $institute;

        $documents = ResearchDocument::query()
            ->where('submission_status', 'approved')
            ->where('archive_status', 'archived')
            ->where(fn (Builder $q) => $q->where('institute', $fullName)->orWhere('academic_unit', $fullName))
            ->orderByDesc('publication_year')
            ->orderByDesc('title')
            ->get(['id', 'title', 'publication_year']);

        $studies = $documents->map(fn (ResearchDocument $d) => [
            'year' => (string) $d->publication_year,
            'title' => $d->title,
            'id' => $d->id,
        ])->all();

        return response()->json(['data' => $studies])
            ->header('Cache-Control', 'private, no-store');
    }

    public function openInstituteStudy(Request $request, string $institute, string $year, string $title)
    {
        $research = ResearchDocument::query()
            ->where('id', $request->query('id'))
            ->first();

        if ($research === null) {
            return response()->json(['error' => 'MANUSCRIPT_NOT_FOUND'], 404);
        }

        $groupedFiles = $research->files()->current()->where('document_type', 'final_manuscript')->orderBy('file_order')->get();
        if ($groupedFiles->isEmpty()) {
            return response()->json(['error' => 'MANUSCRIPT_NOT_FOUND'], 404);
        }

        $selected = $request->query('file');
        if ($selected === null) {
            return $this->studyFileChooser($research, $groupedFiles);
        }

        $file = $groupedFiles->firstWhere('original_filename', $selected);
        if ($file === null) {
            return response()->json(['error' => 'MANUSCRIPT_NOT_FOUND'], 404);
        }

        $files = app(PrivateDocumentFileResolver::class);
        $resolved = $files->resolve($research, $file);
        $contents = file_get_contents($files->resolve($research, $file)['absolute_path']);
        $filename = preg_replace('/[^A-Za-z0-9._ -]/', '_', $file->original_filename) ?: 'manuscript';
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $mimeType = match ($extension) {
            'pdf' => 'application/pdf',
            'doc' => 'application/msword',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            default => 'application/octet-stream',
        };

        return response($contents, 200, [
            'Cache-Control' => 'private, no-store',
            'Content-Disposition' => ($extension === 'pdf' ? 'inline' : 'attachment').'; filename="'.$filename.'"',
            'Content-Type' => $mimeType,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function downloadInstituteStudy(string $institute, string $year, string $title, Request $request)
    {
        $zipPath = false;
        try {
            $research = ResearchDocument::query()->where('id', $request->query('id'))->first();
            if ($research === null) {
                return response()->json(['error' => 'MANUSCRIPT_NOT_FOUND'], 404);
            }

            $groupedFiles = $research->files()->current()->where('document_type', 'final_manuscript')->orderBy('file_order')->get();
            if ($groupedFiles->isEmpty()) {
                return response()->json(['error' => 'MANUSCRIPT_NOT_FOUND'], 404);
            }

            $zipPath = tempnam(sys_get_temp_dir(), 'researchnav-study-');
            $zip = new ZipArchive;
            if ($zipPath === false || $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new \RuntimeException('The manuscript archive could not be created.');
            }
            $files = app(PrivateDocumentFileResolver::class);
            $folder = $this->safeDownloadName($title, 'Study');
            foreach ($groupedFiles as $groupedFile) {
                $resolved = $files->resolve($research, $groupedFile);
                if (! $zip->addFromString($folder.'/'.$this->safeDownloadName($groupedFile->original_filename, 'manuscript'), file_get_contents($resolved['absolute_path']))) {
                    $zip->close();
                    throw new \RuntimeException('The manuscript archive could not be created.');
                }
            }
            if (! $zip->close()) {
                throw new \RuntimeException('The manuscript archive could not be created.');
            }

            return response()->download($zipPath, $folder.'.zip', [
                'Cache-Control' => 'private, no-store',
                'Content-Type' => 'application/zip',
                'X-Content-Type-Options' => 'nosniff',
            ])->deleteFileAfterSend(true);
        } catch (Throwable) {
            if (is_string($zipPath)) {
                @unlink($zipPath);
            }

            return response()->json(['error' => 'MANUSCRIPT_UNAVAILABLE'], 503);
        }
    }

    /** @param Collection<int, DocumentFile> $files */
    private function studyFileChooser(ResearchDocument $research, $files)
    {
        $heading = htmlspecialchars($research->title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $openUrl = route('office.institute-study.open', ['institute' => $research->institute ?? $research->academic_unit, 'year' => $research->publication_year, 'title' => $research->title, 'id' => $research->id]);
        $downloadUrl = htmlspecialchars(route('office.institute-study.download', ['institute' => $research->institute ?? $research->academic_unit, 'year' => $research->publication_year, 'title' => $research->title, 'id' => $research->id]), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $links = $files->map(function (DocumentFile $file) use ($openUrl): string {
            $url = htmlspecialchars($openUrl.'&'.http_build_query(['file' => $file->original_filename]), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $name = htmlspecialchars($file->original_filename, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            return '<li><a href="'.$url.'">'.$name.'</a></li>';
        })->implode('');
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$heading.'</title>'
            .'<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:0 1.5rem;color:#17202a}h1{margin-bottom:.4rem}p{color:#52606d}ul{padding:0;list-style:none}li{margin:.75rem 0}a{display:block;padding:1rem;border:1px solid #ccd3da;border-radius:.5rem;color:#0645ad;text-decoration:none}a:hover,a:focus{border-color:#0645ad}.download{margin-top:2rem;background:#17202a;color:#fff;text-align:center}</style></head>'
            .'<body><main><h1>'.$heading.'</h1><p>Choose a PDF to open, or download the complete study as a ZIP archive.</p><ul>'.$links.'</ul><a class="download" href="'.$downloadUrl.'">Download all manuscripts (.zip)</a></main></body></html>';

        return response($html)->header('Cache-Control', 'private, no-store')->header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")->header('X-Content-Type-Options', 'nosniff');
    }

    private function safeDownloadName(string $name, string $fallback): string
    {
        return trim((string) preg_replace('/[^A-Za-z0-9._ -]+/', '_', $name), '. ') ?: $fallback;
    }

    private function payload(ComplianceReview $review): array
    {
        return [
            'id' => $review->id,
            'research_document_id' => $review->research_document_id,
            'title' => $review->researchDocument?->title,
            'format_compliant' => $review->format_compliant,
            'attachments_compliant' => $review->attachments_compliant,
            'consent_forms_compliant' => $review->consent_forms_compliant,
            'remarks' => $review->remarks,
            'review_status' => $review->review_status,
            'decided_at' => $review->decided_at?->toISOString(),
        ];
    }

    private function escapedLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }

    /** @param array<string, array<int, string>> $rules @return array<string, string> */
    private function validated(Request $request, array $rules): array
    {
        $validator = Validator::make($request->json()->all(), $rules);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }

        return $validator->validated();
    }
}
