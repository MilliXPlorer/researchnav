<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\AccessRequestNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NotificationFetchingTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_unread_count_requires_an_authenticated_active_account(): void
    {
        $this->getJson('/api/notifications/unread-count')->assertUnauthorized();

        $blocked = User::factory()->create(['role' => 'researcher', 'access_status' => 'blocked']);
        $this->withSession(['user_id' => $blocked->id])
            ->getJson('/api/notifications/unread-count')->assertForbidden();
    }

    public function test_count_is_scoped_to_the_actor_and_returns_no_notification_records(): void
    {
        $actor = $this->user();
        $other = $this->user();
        $this->notify($actor);
        $this->notify($actor);
        $this->notify($actor);
        $actor->notifications()->firstOrFail()->markAsRead();
        $this->notify($other);

        DB::enableQueryLog();
        $this->withSession(['user_id' => $actor->id])
            ->getJson('/api/notifications/unread-count')
            ->assertOk()->assertExactJson(['unread_count' => 2]);
        $queries = collect(DB::getQueryLog())
            ->pluck('query')->filter(fn (string $sql) => str_contains($sql, '"notifications"'));
        DB::disableQueryLog();

        $this->assertCount(1, $queries);
        $this->assertStringContainsString('count(*)', strtolower($queries->first()));
        $this->assertDatabaseCount('notifications', 4);
    }

    public function test_empty_count_is_zero_and_read_actions_are_reflected_immediately(): void
    {
        $actor = $this->user();
        $this->withSession(['user_id' => $actor->id])
            ->getJson('/api/notifications/unread-count')->assertExactJson(['unread_count' => 0]);
        $this->notify($actor);
        $id = $actor->notifications()->firstOrFail()->id;

        $this->getJson('/api/notifications/unread-count')->assertExactJson(['unread_count' => 1]);
        $this->patchJson("/api/notifications/{$id}/read", [], ['Origin' => 'http://localhost:5173'])
            ->assertOk()->assertJsonPath('data.id', $id);
        $this->getJson('/api/notifications/unread-count')->assertExactJson(['unread_count' => 0]);
    }

    public function test_full_list_keeps_pagination_and_cannot_mark_another_users_notification_read(): void
    {
        $actor = $this->user();
        for ($i = 0; $i < 20; $i++) {
            $this->notify($actor);
        }
        $other = $this->user();
        $this->notify($other);
        $id = $other->notifications()->firstOrFail()->id;

        $this->withSession(['user_id' => $actor->id])->getJson('/api/notifications')
            ->assertOk()->assertJsonPath('meta.total', 20)->assertJsonCount(15, 'data');
        $this->getJson('/api/notifications?page=2')->assertOk()->assertJsonCount(5, 'data');
        $this->patchJson("/api/notifications/{$id}/read", [], ['Origin' => 'http://localhost:5173'])
            ->assertNotFound();
        $this->getJson('/api/notifications/unread-count')->assertExactJson(['unread_count' => 20]);
    }

    private function user(): User
    {
        return User::factory()->create(['role' => 'researcher', 'access_status' => 'active']);
    }

    private function notify(User $user): void
    {
        $user->notify(new AccessRequestNotification('ACCESS_REQUEST_APPROVED', 'Access approved', 'Your access was approved.'));
    }
}
