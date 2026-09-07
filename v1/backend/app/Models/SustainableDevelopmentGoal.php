<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SustainableDevelopmentGoal extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $primaryKey = 'number';

    protected $keyType = 'int';

    protected $fillable = [
        'number',
        'title',
    ];

    protected function casts(): array
    {
        return [
            'number' => 'integer',
        ];
    }
}
