<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use Illuminate\Support\Collection;

class RepositoryFileChooser
{
    /** @param Collection<int, DocumentFile> $files */
    public function response(ResearchDocument $research, Collection $files, callable $url)
    {
        $heading = htmlspecialchars($research->title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $downloadUrl = htmlspecialchars($url(['all' => 1]), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $links = $files->map(function ($file) use ($url): string {
            $fileUrl = htmlspecialchars($url(['file' => $file->id]), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $name = htmlspecialchars($file->original_filename, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            return '<li><a href="'.$fileUrl.'">'.$name.'</a></li>';
        })->implode('');
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$heading.'</title>'
            .'<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:0 1.5rem;color:#17202a}h1{margin-bottom:.4rem}p{color:#52606d}ul{padding:0;list-style:none}li{margin:.75rem 0}a{display:block;padding:1rem;border:1px solid #ccd3da;border-radius:.5rem;color:#0645ad;text-decoration:none}a:hover,a:focus{border-color:#0645ad}.download{margin-top:2rem;background:#17202a;color:#fff;text-align:center}</style></head>'
            .'<body><main><h1>'.$heading.'</h1><p>Choose a PDF to open, or download the complete study as a ZIP archive.</p><ul>'.$links.'</ul><a class="download" href="'.$downloadUrl.'">Download all manuscripts (.zip)</a></main></body></html>';

        return response($html)->header('Cache-Control', 'private, no-store')->header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")->header('X-Content-Type-Options', 'nosniff');
    }
}
