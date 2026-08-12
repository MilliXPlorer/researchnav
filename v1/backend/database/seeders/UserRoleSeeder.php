<?php

namespace Database\Seeders;

use App\Models\UserRole;
use Illuminate\Database\Seeder;

class UserRoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['name' => 'Researcher', 'slug' => UserRole::RESEARCHER, 'description' => 'Research repository contributor.'],
            ['name' => 'Research Instructor', 'slug' => UserRole::RESEARCH_INSTRUCTOR, 'description' => 'Research instruction and review staff.'],
            ['name' => 'Research Adviser', 'slug' => UserRole::RESEARCH_ADVISER, 'description' => 'Academic research adviser.'],
            ['name' => 'Research Office Personnel', 'slug' => UserRole::RESEARCH_OFFICE, 'description' => 'Research office operations personnel.'],
            ['name' => 'System Administrator', 'slug' => UserRole::ADMINISTRATOR, 'description' => 'ResearchNAV system administrator.'],
            ['name' => 'Statistician', 'slug' => UserRole::STATISTICIAN, 'description' => 'Statistical research review personnel.'],
            ['name' => 'Librarian', 'slug' => UserRole::LIBRARIAN, 'description' => 'Research repository and archive personnel.'],
            ['name' => 'Research Panelist', 'slug' => UserRole::RESEARCH_PANELIST, 'description' => 'Assigned research panel reviewer.'],
        ];

        $unknownSlugs = UserRole::query()->whereNotIn('slug', array_column($roles, 'slug'))->pluck('slug');
        if ($unknownSlugs->isNotEmpty()) {
            throw new \LogicException('Unknown user role slug(s): '.$unknownSlugs->implode(', '));
        }

        foreach ($roles as $role) {
            UserRole::query()->updateOrCreate(['slug' => $role['slug']], $role + ['is_active' => true]);
        }
    }
}
