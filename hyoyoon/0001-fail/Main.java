package bronze5.boj1000;

import java.util.Scanner;

public class Main {

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("두 정수 A와 B를 입력하세요(예. 7 5): ");
        // nextInt()는 정수로 캐스팅이 가능한 입력에 대해서만 처리하고,
        // 캐스팅 불가한 입력값은 무시(건너 뜀).
        int a = scanner.nextInt();
        int b = scanner.nextInt();
        System.out.println(a + b);
    }
}
