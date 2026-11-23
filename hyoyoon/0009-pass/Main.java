import java.io.*;
import java.util.*;

public class Main {

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine(), " ");
        StringBuilder sb = new StringBuilder();

        long sum = 0;
        while (st.hasMoreTokens()) {
            String token = st.nextToken();
            sum += Long.parseLong(token);
        }

        sb.append(sum);
        System.out.println(sb);
    }
}
