<?php

namespace App\Services;

use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\Storage;

class InstitutionalPdfService
{
    /**
     * @param  list<string>  $columns
     * @param  list<list<string|int>>  $rows
     */
    public function render(string $title, array $columns, array $rows, int $total, ?string $subtitle = null): string
    {
        $html = view('pdf.institutional-report', [
            'title' => $title,
            'columns' => $columns,
            'rows' => $rows,
            'total' => $total,
            'subtitle' => $subtitle,
            'generatedAt' => now()->timezone('Asia/Manila')->format('n/j/Y, g:i:s A'),
            'collegeLogo' => $this->imageDataUri('logo/tcgc_logo.jpg'),
            'researchLogo' => $this->imageDataUri('logo/research_publications_logo.jpg'),
        ])->render();

        $options = new Options;
        $options->set('defaultFont', 'Arial');
        $options->set('isRemoteEnabled', false);

        $pdf = new Dompdf($options);
        $pdf->setPaper('A4', 'portrait');
        $pdf->loadHtml($html);
        $pdf->render();

        $canvas = $pdf->getCanvas();
        $font = $pdf->getFontMetrics()->getFont('Arial', 'normal');
        $canvas->page_text(72, 28, $this->generatedLabel(), $font, 7, [0.28, 0.28, 0.28]);
        $canvas->page_text(370, 805, 'ResearchNav | https://www.researchnav.tech', $font, 7, [0.28, 0.28, 0.28]);

        return $pdf->output();
    }

    private function imageDataUri(string $path): string
    {
        $contents = Storage::disk('local')->get($path);

        return 'data:image/jpeg;base64,'.base64_encode($contents);
    }

    private function generatedLabel(): string
    {
        return now()->timezone('Asia/Manila')->format('n/j/Y, g:i:s A');
    }
}
