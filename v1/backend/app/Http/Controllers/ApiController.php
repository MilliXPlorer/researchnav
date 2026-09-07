<?php

namespace App\Http\Controllers;

use App\Contracts\GoogleIdTokenVerifier;
use App\Exceptions\ApiValidationException;
use App\Models\User;
use App\Services\AccountService;
use App\Services\AuditService;
use App\Services\InvitationMailer;
use App\Services\UserSessionMapper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\Response;

class ApiController extends Controller
{
    private const LEGACY_SESSION_COOKIE = 'researchnav.sid';

    public function health(): Response
    {
        return response()->json(['status' => 'ok']);
    }

    public function google(Request $request, GoogleIdTokenVerifier $verifier, AccountService $accounts): Response
    {
        $input = $this->validated($request, ['credential' => ['required', 'string', 'min:1', 'max:16384']]);
        $identity = $verifier->verify($input['credential']);

        if ($identity->subject === '' || $identity->email === '' || ! $identity->emailVerified) {
            return response()->json(['error' => 'GOOGLE_EMAIL_NOT_VERIFIED'], 401);
        }

        $user = $accounts->resolveGoogleUser($identity->email, $identity->subject);
        $request->session()->regenerate(true);
        Auth::guard()->login($user);
        $request->session()->put('user_id', $user->id);
        $request->session()->save();
        Cookie::queue(Cookie::forget(self::LEGACY_SESSION_COOKIE));

        return response()->json(['user' => UserSessionMapper::map($user)])
            ->header('Cache-Control', 'private, no-store')
            ->header('Vary', 'Cookie');
    }

    public function session(Request $request): Response
    {
        return response()->json(['user' => UserSessionMapper::map($this->currentUser($request))])
            ->header('Cache-Control', 'private, no-store')
            ->header('Vary', 'Cookie');
    }

    public function logout(Request $request): Response
    {
        Auth::guard()->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        Cookie::queue(Cookie::forget(config('session.cookie')));
        Cookie::queue(Cookie::forget(self::LEGACY_SESSION_COOKIE));

        return response()->noContent();
    }

    public function coordinators(Request $request, AccountService $accounts): Response
    {
        return response()
            ->json(['users' => array_map(UserSessionMapper::map(...), $accounts->listProvisionedUsers('coordinator'))])
            ->header('Cache-Control', 'private, no-store');
    }

    public function provisionCoordinator(Request $request, AccountService $accounts, InvitationMailer $mailer): Response
    {
        return $this->provision($request, $accounts, $mailer, 'coordinator', 'Research Coordinator');
    }

    public function accounts(AccountService $accounts): Response
    {
        return response()
            ->json(['users' => array_map(UserSessionMapper::map(...), $accounts->listProvisionedAccounts())])
            ->header('Cache-Control', 'private, no-store');
    }

    public function provisionAccount(Request $request, AccountService $accounts, InvitationMailer $mailer): Response
    {
        $roles = array_values(array_diff(User::LEGACY_ROLES, ['admin']));
        $input = $this->validated($request, [
            'email' => ['required', 'string', 'email', 'max:254'],
            'role' => ['required', 'string', 'in:'.implode(',', $roles)],
        ]);

        return $this->provision(
            $request,
            $accounts,
            $mailer,
            $input['role'],
            ucwords(str_replace('-', ' ', $input['role'])),
        );
    }

    public function instructors(Request $request, AccountService $accounts): Response
    {
        return response()
            ->json(['users' => array_map(UserSessionMapper::map(...), $accounts->listProvisionedUsers('instructor'))])
            ->header('Cache-Control', 'private, no-store');
    }

    public function provisionInstructor(Request $request, AccountService $accounts, InvitationMailer $mailer): Response
    {
        return $this->provision($request, $accounts, $mailer, 'instructor', 'Research Instructor');
    }

    private function provision(Request $request, AccountService $accounts, InvitationMailer $mailer, string $role, string $roleLabel): Response
    {
        $input = $this->validated($request, ['email' => ['required', 'string', 'email', 'max:254']]);
        try {
            $user = $accounts->provisionUser($input['email'], $role, $this->currentUser($request)->id);
        } catch (\RuntimeException) {
            return response()->json(['error' => 'ACCOUNT_ROLE_CONFLICT'], 409);
        }
        app(AuditService::class)->log(
            $this->currentUser($request),
            strtoupper($role).'_PROVISIONED',
            $user,
            'Provisioned '.str_replace('-', ' ', $role).'.',
            $request,
        );
        $mailer->send($user->email, $roleLabel, $user->access_status === 'active');

        return response()->json(['user' => UserSessionMapper::map($user)], 201);
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

    private function currentUser(Request $request): User
    {
        /** @var User $user */
        $user = $request->attributes->get('current_user');

        return $user;
    }
}
