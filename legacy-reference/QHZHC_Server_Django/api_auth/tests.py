from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from unittest.mock import patch

from api_auth.middleware import CustomTokenAuthentication

User = get_user_model()


class AuthenticationCookieContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="cookie_contract_user",
            password="correct-password",
            email="cookie-contract@example.com",
            phone_number="13800000001",
            can_visit_realtime=True,
            can_visit_history=False,
        )
        self.access_token = str(RefreshToken.for_user(self.user).access_token)

    def test_login_sets_httponly_cookie_without_returning_access_token(self):
        response = self.client.post(
            "/auth/login/",
            {"username": self.user.username, "password": "correct-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("token", response.json())
        self.assertIn("qhzhc_access", response.cookies)
        self.assertTrue(response.cookies["qhzhc_access"]["httponly"])

    def test_login_replaces_invalid_access_cookie(self):
        self.client.cookies["qhzhc_access"] = "invalid-token"

        response = self.client.post(
            "/auth/login/",
            {"username": self.user.username, "password": "correct-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("qhzhc_access", response.cookies)

    def test_session_profile_requires_authenticated_cookie(self):
        anonymous_client = APIClient()
        response = anonymous_client.get("/auth/session/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_and_session_profiles_include_visualization_permissions(self):
        login_response = self.client.post(
            "/auth/login/",
            {"username": self.user.username, "password": "correct-password"},
            format="json",
        )
        self.client.cookies["qhzhc_access"] = login_response.cookies[
            "qhzhc_access"
        ].value

        session_response = self.client.get("/auth/session/")

        for response in (login_response, session_response):
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertTrue(response.json()["can_visit_realtime"])
            self.assertFalse(response.json()["can_visit_history"])

    def test_logout_clears_access_cookie(self):
        login_response = self.client.post(
            "/auth/login/",
            {"username": self.user.username, "password": "correct-password"},
            format="json",
        )
        csrf_token = login_response.cookies["csrftoken"].value
        self.client.cookies["qhzhc_access"] = login_response.cookies[
            "qhzhc_access"
        ].value
        self.client.cookies["csrftoken"] = csrf_token

        response = self.client.post(
            "/auth/logout/",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertIn("qhzhc_access", response.cookies)
        self.assertEqual(response.cookies["qhzhc_access"]["max-age"], 0)

    def test_logout_rejects_cookie_session_without_csrf_token(self):
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.cookies["qhzhc_access"] = self.access_token

        response = csrf_client.post("/auth/logout/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_issues_csrf_cookie_for_authenticated_writes(self):
        login_response = self.client.post(
            "/auth/login/",
            {"username": self.user.username, "password": "correct-password"},
            format="json",
        )
        csrf_token = login_response.cookies["csrftoken"].value
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.cookies["qhzhc_access"] = login_response.cookies[
            "qhzhc_access"
        ].value
        csrf_client.cookies["csrftoken"] = csrf_token

        response = csrf_client.post(
            "/auth/logout/",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_custom_token_authentication_reads_access_cookie(self):
        request = Request(
            APIRequestFactory().get(
                "/auth/session/",
                HTTP_COOKIE=f"qhzhc_access={self.access_token}",
            )
        )

        authentication = CustomTokenAuthentication().authenticate(request)

        self.assertIsNotNone(authentication)
        self.assertEqual(authentication[0].pk, self.user.pk)

    def test_custom_token_authentication_rejects_legacy_token_header(self):
        request = Request(
            APIRequestFactory().get(
                "/auth/session/",
                HTTP_TOKEN=self.access_token,
            )
        )

        self.assertIsNone(CustomTokenAuthentication().authenticate(request))

    def test_legacy_token_endpoint_is_not_available(self):
        response = self.client.post(
            "/auth/token/",
            {"username": self.user.username, "password": "correct-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(QHZHC_ACCESS_COOKIE_SECURE=True)
    def test_login_cookie_is_secure_in_production_mode(self):
        response = self.client.post(
            "/auth/login/",
            {"username": self.user.username, "password": "correct-password"},
            format="json",
        )

        self.assertTrue(response.cookies["qhzhc_access"]["secure"])


class SmtpConfigurationContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="smtp_admin",
            password="correct-password",
            email="smtp-admin@example.com",
            phone_number="13800000002",
        )
        self.user = User.objects.create_user(
            username="smtp_target",
            password="correct-password",
            email="smtp-target@example.com",
            phone_number="13800000003",
        )
        self.client.force_authenticate(user=self.admin)

    @override_settings(
        QHZHC_SMTP_HOST="smtp.example.test",
        QHZHC_SMTP_PORT=2465,
        QHZHC_SMTP_USER="sender@example.test",
        QHZHC_SMTP_PASSWORD="smtp-test-password",
    )
    @patch("api_auth.views.send_email", return_value=True)
    def test_permission_notification_uses_smtp_settings(self, send_email_mock):
        response = self.client.post(
            "/auth/admin/update_permissions/",
            {
                "username": self.user.username,
                "can_visit_realtime": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            send_email_mock.call_args.args[:5],
            (
                self.user.email,
                "smtp.example.test",
                2465,
                "sender@example.test",
                "smtp-test-password",
            ),
        )

    @override_settings(
        QHZHC_SMTP_HOST=None,
        QHZHC_SMTP_PORT=None,
        QHZHC_SMTP_USER=None,
        QHZHC_SMTP_PASSWORD=None,
    )
    @patch("api_auth.views.send_email")
    def test_missing_smtp_configuration_does_not_attempt_delivery(
        self,
        send_email_mock,
    ):
        from api_auth.views import send_configured_email

        delivered = send_configured_email(
            "recipient@example.test",
            "subject",
            "<p>content</p>",
            "recipient",
        )

        self.assertFalse(delivered)
        send_email_mock.assert_not_called()
