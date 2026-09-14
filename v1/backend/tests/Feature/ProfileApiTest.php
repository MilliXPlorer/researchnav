<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileApiTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_profile_requires_authentication_but_not_active_workspace_access(): void
    {
        $this->getJson('/api/profile')
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);

        $blocked = User::factory()->create(['access_status' => 'blocked']);
        $this->withSession(['user_id' => $blocked->id])
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('user.email', $blocked->email)
            ->assertJsonPath('user.displayName', $blocked->first_name.' '.$blocked->last_name)
            ->assertHeader('Cache-Control');

        $this->withSession(['user_id' => $blocked->id])
            ->getJson('/api/dashboard')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);
    }

    public function test_user_can_update_only_own_editable_profile_fields(): void
    {
        $user = User::factory()->create([
            'access_status' => 'blocked',
            'student_employee_id' => 'INSTITUTION-ASSIGNED',
        ]);

        $this->withSession(['user_id' => $user->id])
            ->patchJson('/api/profile', [
                'first_name' => '  Ada ',
                'middle_name' => '',
                'last_name' => ' Lovelace ',
            ], $this->origin())
            ->assertOk()
            ->assertJsonPath('user.firstName', 'Ada')
            ->assertJsonPath('user.middleName', null)
            ->assertJsonPath('user.lastName', 'Lovelace')
            ->assertJsonPath('user.studentEmployeeId', 'INSTITUTION-ASSIGNED')
            ->assertJsonPath('user.displayName', 'Ada Lovelace');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email' => $user->email,
            'first_name' => 'Ada',
            'middle_name' => null,
            'last_name' => 'Lovelace',
            'student_employee_id' => 'INSTITUTION-ASSIGNED',
        ]);

        $this->withSession(['user_id' => $user->id])
            ->patchJson('/api/profile', ['email' => 'changed@example.edu'], $this->origin())
            ->assertUnprocessable()
            ->assertJsonPath('error', 'VALIDATION_FAILED')
            ->assertJsonValidationErrors(['email', 'request']);

        $this->withSession(['user_id' => $user->id])
            ->patchJson('/api/profile', ['student_employee_id' => 'CLAIMED-ID'], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['student_employee_id', 'request']);
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'student_employee_id' => 'INSTITUTION-ASSIGNED',
        ]);

        $this->withSession(['user_id' => $user->id])
            ->patchJson('/api/profile', ['firstName' => 'Grace'], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['request']);
    }

    public function test_profile_mutations_require_the_exact_allowed_origin(): void
    {
        $user = User::factory()->create();

        $this->withSession(['user_id' => $user->id])
            ->patchJson('/api/profile', ['first_name' => 'Ada'])
            ->assertForbidden()
            ->assertExactJson(['error' => 'ORIGIN_NOT_ALLOWED']);
    }

    public function test_user_can_upload_replace_read_and_remove_a_private_photo(): void
    {
        Storage::fake('researchnav_private');
        $user = User::factory()->create(['access_status' => 'blocked']);

        $first = $this->withSession(['user_id' => $user->id])
            ->post('/api/profile/photo', [
                'photo' => $this->pngUpload('first.png'),
            ], $this->origin())
            ->assertOk();
        $firstUrl = $first->json('user.profilePhotoUrl');
        $firstPath = $user->fresh()->profile_photo_path;
        $this->assertIsString($firstUrl);
        Storage::disk('researchnav_private')->assertExists($firstPath);

        $this->withSession(['user_id' => $user->id])
            ->get($firstUrl)
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader('Cache-Control');

        $other = User::factory()->create();
        $this->withSession(['user_id' => $other->id])
            ->getJson($firstUrl)
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);

        $second = $this->withSession(['user_id' => $user->id])
            ->post('/api/profile/photo', [
                'photo' => $this->pngUpload('second.png'),
            ], $this->origin())
            ->assertOk();
        $secondUrl = $second->json('user.profilePhotoUrl');
        $this->assertNotSame($firstUrl, $secondUrl);
        Storage::disk('researchnav_private')->assertMissing($firstPath);

        $this->withSession(['user_id' => $user->id])->getJson($firstUrl)->assertNotFound();
        $this->withSession(['user_id' => $user->id])
            ->deleteJson('/api/profile/photo', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('user.profilePhotoUrl', null);
        $this->withSession(['user_id' => $user->id])->getJson($secondUrl)->assertNotFound();

        $this->withSession(['user_id' => $user->id])
            ->deleteJson('/api/profile/photo', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('user.profilePhotoUrl', null);
    }

    public function test_profile_photo_rejects_unsupported_content(): void
    {
        Storage::fake('researchnav_private');
        $user = User::factory()->create();

        $this->withSession(['user_id' => $user->id])
            ->post('/api/profile/photo', [
                'photo' => UploadedFile::fake()->createWithContent('avatar.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
            ], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        Storage::disk('researchnav_private')->assertDirectoryEmpty('profile-photos');
    }

    public function test_profile_photo_transport_rejects_oversized_multipart_requests(): void
    {
        $user = User::factory()->create();

        $this->withSession(['user_id' => $user->id])
            ->post('/api/profile/photo', [], [
                ...$this->origin(),
                'Content-Length' => (string) (3 * 1024 * 1024 + 1),
                'Content-Type' => 'multipart/form-data; boundary=test',
            ])
            ->assertStatus(413)
            ->assertExactJson(['error' => 'PAYLOAD_TOO_LARGE']);
    }

    /** @return array<string, string> */
    private function origin(): array
    {
        return ['Origin' => 'http://localhost:5173'];
    }

    private function pngUpload(string $name): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $name,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true),
        );
    }
}
