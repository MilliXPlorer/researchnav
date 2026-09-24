<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 0.75in 1in 0.85in; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #111; font-family: Arial, sans-serif; font-size: 8pt; }
        .letterhead { padding: 12px 0 18px; border-bottom: 1px solid #777; text-align: center; }
        .letterhead table { width: 350px; margin: 0 auto; border: 0; }
        .letterhead td { padding: 0; border: 0; vertical-align: middle; }
        .letterhead .logo-cell { width: 30px; text-align: center; }
        .letterhead .school-details { width: 290px; text-align: center; }
        .letterhead img { width: 60px; height: 60px; margin: 0 -15px; object-fit: contain; }
        .letterhead h1 { margin: 0 0 3px; font-size: 14pt; line-height: 1.15; text-align: center; white-space: nowrap; }
        .letterhead p { margin: 0; font-size: 8pt; text-align: center; }
        .title { padding: 16px 0 18px; text-align: center; }
        .title h2 { margin: 0 0 4px; font-size: 11pt; text-transform: uppercase; }
        .title p, .title small { display: block; margin: 0; color: #444; font-size: 7.5pt; line-height: 1.4; }
        .report { width: 100%; border-collapse: collapse; table-layout: auto; }
        .report thead { display: table-header-group; }
        .report tr { page-break-inside: avoid; }
        .report th, .report td { padding: 6px 4px; border-bottom: 0.5px solid #d2d2d2; text-align: left; vertical-align: top; }
        .report th { border-top: 1px solid #777; border-bottom: 1px solid #777; font-size: 7.25pt; }
        .report th:last-child, .report td:last-child { width: 80px; text-align: right; }
        .empty { margin: 14px 0 0; color: #555; text-align: center; }
    </style>
</head>
<body>
    <header class="letterhead">
        <table role="presentation"><tr>
            <td class="logo-cell"><img src="{{ $collegeLogo }}" alt=""></td>
            <td class="school-details"><h1>Tangub City Global College</h1><p>Maloro, Tangub City</p></td>
            <td class="logo-cell"><img src="{{ $researchLogo }}" alt=""></td>
        </tr></table>
    </header>
    <section class="title">
        <h2>{{ $title }}</h2>
        <p>{{ $subtitle ?? 'ResearchNAV Institutional Report' }}</p>
        <small>Total records: {{ $total }}</small>
    </section>
    @if (count($rows) > 0)
        <table class="report">
            <thead><tr>@foreach ($columns as $column)<th>{{ $column }}</th>@endforeach</tr></thead>
            <tbody>
                @foreach ($rows as $row)
                    <tr>@foreach ($row as $cell)<td>{{ $cell }}</td>@endforeach</tr>
                @endforeach
            </tbody>
        </table>
    @else
        <p class="empty">No records are available for this report.</p>
    @endif
</body>
</html>
